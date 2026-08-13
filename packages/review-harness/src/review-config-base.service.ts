import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import JSON5 from 'json5';

import type { ReviewSource } from './review.types';

const DEFAULT_OUTPUT_PATH = 'output/report.html';
const DEFAULT_EXTERNAL_SYSTEM_NAMES: Record<ReviewSource, string> = {
  bbl: 'BBL',
  tp: 'TP',
};

/** What a concrete tool config service tells the base about itself. */
export interface ReviewConfigOptions {
  /** Absolute path to the tool's JSON5 config file. */
  filePath: string;
  /** File name used in every error message, e.g. `review-match-config.json5`. */
  fileName: string;
  /** What the tool's override ids identify, e.g. `external match ids`. */
  overrideLabel: string;
}

/**
 * The JSON5-file loading and the getters both review tools' config services
 * share. Deliberately not `@Injectable()`: it is never a provider itself —
 * each tool's concrete subclass carries the decorator and the `@Inject`ed
 * config-path token, and adds its own per-stratum-size getter.
 *
 * Loading is eager (once, in the constructor) but validation is lazy and
 * per-field, so a developer only ever sees an error about the setting they
 * actually need.
 */
export abstract class ReviewConfigServiceBase {
  private readonly config: Record<string, unknown>;
  private readonly fileName: string;
  private readonly overrideLabel: string;

  constructor(options: ReviewConfigOptions) {
    this.fileName = options.fileName;
    this.overrideLabel = options.overrideLabel;
    this.config = this.load(options.filePath);
  }

  /** Connection string of the database to read imported data from. */
  getDatabaseUrl(): string {
    const url = this.group('database').url;
    if (typeof url !== 'string' || url === '') {
      throw new Error(
        `database.url is not set in ${this.fileName}. Set it to the ` +
          'connection string of the database holding the imported data, e.g. ' +
          "'postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl'.",
      );
    }
    return url;
  }

  /** Absolute path to a source's downloaded raw data directory. */
  getDataDir(source: ReviewSource): string {
    const dir = this.group(source).dataDir;
    if (typeof dir !== 'string' || dir === '') {
      throw new Error(
        `${source}.dataDir is not set in ${this.fileName}. Set it to ` +
          `the folder holding the downloaded ${source.toUpperCase()} data.`,
      );
    }
    return resolve(dir);
  }

  /** Name the source's records are registered under in `external_systems`. */
  getExternalSystemName(source: ReviewSource): string {
    const name = this.group(source).externalSystemName;
    return typeof name === 'string' && name !== ''
      ? name
      : DEFAULT_EXTERNAL_SYSTEM_NAMES[source];
  }

  /** Source-specific external ids to always include in the report. */
  getOverrides(source: ReviewSource): string[] {
    const raw = this.group('overrides')[source];
    if (raw === undefined) {
      return [];
    }
    if (!Array.isArray(raw)) {
      throw new Error(
        `overrides.${source} in ${this.fileName} must be an array of ` +
          `${this.overrideLabel}.`,
      );
    }
    return raw.map((entry) => String(entry));
  }

  /** Absolute path the generated HTML report is written to. */
  getOutputPath(): string {
    const raw = this.config.outputPath;
    return resolve(
      typeof raw === 'string' && raw !== '' ? raw : DEFAULT_OUTPUT_PATH,
    );
  }

  /**
   * A top-level positive-integer setting, or `fallback` when unset. Used by
   * each tool for its own per-stratum sample size.
   */
  protected positiveInteger(key: string, fallback: number): number {
    const raw = this.config[key];
    if (raw === undefined) {
      return fallback;
    }
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
      throw new Error(
        `${key} in ${this.fileName} must be a positive ` +
          `integer; got ${JSON.stringify(raw)}.`,
      );
    }
    return raw;
  }

  /** A top-level object group, or an empty object when absent. */
  private group(key: string): Record<string, unknown> {
    const value = this.config[key];
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  /**
   * Read and parse the JSON5 file once. A missing file is treated as an empty
   * config so each getter can still throw its own friendly per-field error
   * lazily; a syntactically invalid file throws immediately with the path.
   * Mirrors ImportTpConfigService's loading behaviour.
   */
  private load(filePath: string): Record<string, unknown> {
    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON5.parse(raw);
    } catch (error) {
      throw new Error(
        `Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  }
}

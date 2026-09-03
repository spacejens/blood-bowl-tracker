import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import JSON5 from 'json5';

import type { ReviewSource } from './review.types';
import {
  configGroupSchema,
  nonEmptyStringSchema,
  overrideIdsSchema,
  positiveIntegerSchema,
} from './review-config.schema';

const DEFAULT_OUTPUT_PATH = 'output/report.html';
const DEFAULT_EXTERNAL_SYSTEM_NAMES: Record<ReviewSource, string> = {
  bbl: 'BBL',
  tp: 'TP',
  manual: 'Manual',
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
    const url = nonEmptyStringSchema.safeParse(this.group('database').url);
    if (!url.success) {
      throw new Error(
        `database.url is not set in ${this.fileName}. Set it to the ` +
          'connection string of the database holding the imported data, e.g. ' +
          "'postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl'.",
      );
    }
    return url.data;
  }

  /** Absolute path to a source's raw data directory. */
  getDataDir(source: ReviewSource): string {
    const dir = nonEmptyStringSchema.safeParse(this.group(source).dataDir);
    if (!dir.success) {
      throw new Error(
        `${source}.dataDir is not set in ${this.fileName}. Set it to ` +
          this.dataDirHint(source),
      );
    }
    return resolve(dir.data);
  }

  /**
   * `manual` data is git-tracked (tools/import-manual's committed data
   * directory), not downloaded, so the hint for it reads differently than
   * for `bbl`/`tp`, whose data genuinely is downloaded into a local mirror.
   */
  private dataDirHint(source: ReviewSource): string {
    return source === 'manual'
      ? "the folder holding tools/import-manual's curated data."
      : `the folder holding the downloaded ${source.toUpperCase()} data.`;
  }

  /** Name the source's records are registered under in `external_systems`. */
  getExternalSystemName(source: ReviewSource): string {
    const name = nonEmptyStringSchema.safeParse(
      this.group(source).externalSystemName,
    );
    return name.success ? name.data : DEFAULT_EXTERNAL_SYSTEM_NAMES[source];
  }

  /** Source-specific external ids to always include in the report. */
  getOverrides(source: ReviewSource): string[] {
    const raw = this.group('overrides')[source];
    if (raw === undefined) {
      return [];
    }
    const ids = overrideIdsSchema.safeParse(raw);
    if (!ids.success) {
      throw new Error(
        `overrides.${source} in ${this.fileName} must be an array of ` +
          `${this.overrideLabel}.`,
      );
    }
    return ids.data.map((entry) => String(entry));
  }

  /** Absolute path the generated HTML report is written to. */
  getOutputPath(): string {
    const raw = nonEmptyStringSchema.safeParse(this.config.outputPath);
    return resolve(raw.success ? raw.data : DEFAULT_OUTPUT_PATH);
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
    const parsed = positiveIntegerSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${key} in ${this.fileName} must be a positive ` +
          `integer; got ${JSON.stringify(raw)}.`,
      );
    }
    return parsed.data;
  }

  /** A top-level object group, or an empty object when absent. */
  private group(key: string): Record<string, unknown> {
    return configGroupSchema.parse(this.config[key]);
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

    return configGroupSchema.parse(parsed);
  }
}

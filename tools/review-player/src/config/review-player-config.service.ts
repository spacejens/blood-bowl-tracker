import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import JSON5 from 'json5';

import type { ReviewSource } from '../shared/review.types';

/** DI token carrying the absolute path to the JSON5 config file. */
export const REVIEW_PLAYER_CONFIG_PATH = Symbol('REVIEW_PLAYER_CONFIG_PATH');

/**
 * Default config-file location: `review-player-config.json5` in the current
 * working directory. The tool is run from `tools/review-player/`, so this
 * resolves to that directory's file.
 */
export const DEFAULT_REVIEW_PLAYER_CONFIG_PATH = resolve(
  process.cwd(),
  'review-player-config.json5',
);

const DEFAULT_PLAYERS_PER_STRATUM = 3;
const DEFAULT_OUTPUT_PATH = 'output/report.html';
const DEFAULT_EXTERNAL_SYSTEM_NAMES: Record<ReviewSource, string> = {
  bbl: 'BBL',
  tp: 'TP',
};

@Injectable()
export class ReviewPlayerConfigService {
  private readonly config: Record<string, unknown>;

  constructor(
    @Inject(REVIEW_PLAYER_CONFIG_PATH) private readonly filePath: string,
  ) {
    this.config = this.load();
  }

  /** Connection string of the database to read imported data from. */
  getDatabaseUrl(): string {
    const database = this.group('database');
    const url = database.url;
    if (typeof url !== 'string' || url === '') {
      throw new Error(
        'database.url is not set in review-player-config.json5. Set it to the ' +
          'connection string of the database holding the imported data, e.g. ' +
          "'postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl'.",
      );
    }
    return url;
  }

  /** How many players the random-sample stratum picks, per source. */
  getPlayersPerStratum(): number {
    const raw = this.config.playersPerStratum;
    if (raw === undefined) {
      return DEFAULT_PLAYERS_PER_STRATUM;
    }
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
      throw new Error(
        'playersPerStratum in review-player-config.json5 must be a positive ' +
          `integer; got ${JSON.stringify(raw)}.`,
      );
    }
    return raw;
  }

  /** Absolute path to a source's downloaded raw data directory. */
  getDataDir(source: ReviewSource): string {
    const dir = this.group(source).dataDir;
    if (typeof dir !== 'string' || dir === '') {
      throw new Error(
        `${source}.dataDir is not set in review-player-config.json5. Set it to ` +
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

  /**
   * Source-specific external player ids (BBL's `pid`, TP's line-up `id`) to
   * always include in the report.
   */
  getOverrides(source: ReviewSource): string[] {
    const raw = this.group('overrides')[source];
    if (raw === undefined) {
      return [];
    }
    if (!Array.isArray(raw)) {
      throw new Error(
        `overrides.${source} in review-player-config.json5 must be an array of ` +
          'external player ids.',
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
  private load(): Record<string, unknown> {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
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
        `Failed to parse ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  }
}

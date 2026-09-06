import { resolve } from 'node:path';

import type { ConfigLoader } from '@blood-bowl-tracker/config-loader';
import { createConfigLoaderServiceBase } from '@blood-bowl-tracker/config-loader';
import type { InjectionToken } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

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

/** The three genuinely per-tool decisions a review config service makes. */
export interface ReviewConfigServiceConfig {
  /** DI token carrying the absolute path to the tool's JSON5 config file. */
  pathToken: InjectionToken;
  /** File name used in every error message, e.g. `review-match-config.json5`. */
  fileName: string;
  /** What the tool's override ids identify, e.g. `external match ids`. */
  overrideLabel: string;
}

/** What every generated review config base class offers. */
export interface ReviewConfigService extends ConfigLoader {
  getDatabaseUrl(): string;
  getDataDir(source: ReviewSource): string;
  getExternalSystemName(source: ReviewSource): string;
  getOverrides(source: ReviewSource): string[];
  getOutputPath(): string;
  /**
   * A top-level positive-integer setting, or `fallback` when unset. Public
   * rather than protected because it is part of the constructor type this
   * factory returns, and a protected member cannot be expressed there; it is
   * meant for subclasses only, each of which wraps it in its own named getter.
   */
  positiveInteger(key: string, fallback: number): number;
}

/**
 * Named so `tsc --declaration` can emit `declare const X_base: ...` for every
 * subclass; an anonymous class expression here would fail declaration emit.
 */
export type ReviewConfigServiceConstructor = new (
  filePath: string,
) => ReviewConfigService;

/**
 * Builds the shared body of a review tool's config service: the generic JSON5
 * loading from `packages/config-loader`, plus the getters all three review
 * tools share, with the tool's own config file name and override label
 * substituted into the error messages.
 *
 * A class-factory rather than a service: what it returns is the
 * `@Injectable()` class each review tool's config service extends, so NestJS
 * DI manages the result directly instead of injecting this function's output
 * anywhere. None of the four exemptions in CLAUDE.md's "Service vs. loose
 * function" describes that shape — the "generic over entity/table type" one
 * least of all, since the parameter is a runtime config object (`pathToken`,
 * `fileName`, `overrideLabel`) rather than a compile-time generic. The
 * `@Injectable()` decorator and the base's `@Inject(pathToken)` parameter
 * decorator are found through the subclass's prototype chain, which is why a
 * subclass needs no constructor of its own.
 *
 * Loading is eager (once, in the base's constructor) but validation is lazy
 * and per-field, so a developer only ever sees an error about the setting they
 * actually need.
 */
export function createReviewConfigServiceBase(
  config: ReviewConfigServiceConfig,
): ReviewConfigServiceConstructor {
  @Injectable()
  class ReviewConfigServiceBase
    extends createConfigLoaderServiceBase({
      pathToken: config.pathToken,
      schema: configGroupSchema,
    })
    implements ReviewConfigService
  {
    /** Connection string of the database to read imported data from. */
    getDatabaseUrl(): string {
      const url = nonEmptyStringSchema.safeParse(this.group('database').url);
      if (!url.success) {
        throw new Error(
          `database.url is not set in ${config.fileName}. Set it to the ` +
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
          `${source}.dataDir is not set in ${config.fileName}. Set it to ` +
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
          `overrides.${source} in ${config.fileName} must be an array of ` +
            `${config.overrideLabel}.`,
        );
      }
      return ids.data.map((entry) => String(entry));
    }

    /** Absolute path the generated HTML report is written to. */
    getOutputPath(): string {
      const raw = nonEmptyStringSchema.safeParse(this.get('outputPath'));
      return resolve(raw.success ? raw.data : DEFAULT_OUTPUT_PATH);
    }

    /**
     * A top-level positive-integer setting, or `fallback` when unset. Used by
     * each tool for its own per-stratum sample size.
     */
    positiveInteger(key: string, fallback: number): number {
      const raw = this.get(key);
      if (raw === undefined) {
        return fallback;
      }
      const parsed = positiveIntegerSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(
          `${key} in ${config.fileName} must be a positive ` +
            `integer; got ${JSON.stringify(raw)}.`,
        );
      }
      return parsed.data;
    }

    /** A top-level object group, or an empty object when absent. */
    private group(key: string): Record<string, unknown> {
      return configGroupSchema.parse(this.get(key));
    }
  }

  return ReviewConfigServiceBase;
}

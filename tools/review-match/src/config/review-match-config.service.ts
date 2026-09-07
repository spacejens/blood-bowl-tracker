import { resolve } from 'node:path';

import { createReviewConfigServiceBase } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

/** DI token carrying the absolute path to the JSON5 config file. */
export const REVIEW_MATCH_CONFIG_PATH = Symbol('REVIEW_MATCH_CONFIG_PATH');

const CONFIG_FILE_NAME = 'review-match-config.json5';

/**
 * Default config-file location: `review-match-config.json5` in the current
 * working directory. The tool is run from `tools/review-match/`, so this
 * resolves to that directory's file.
 */
export const DEFAULT_REVIEW_MATCH_CONFIG_PATH = resolve(
  process.cwd(),
  CONFIG_FILE_NAME,
);

const DEFAULT_MATCHES_PER_STRATUM = 3;

/**
 * review-match's config: the shared review-harness getters (database url,
 * data dirs, external system names, overrides, output path) plus the one
 * setting only this tool has.
 */
@Injectable()
export class ReviewMatchConfigService extends createReviewConfigServiceBase({
  pathToken: REVIEW_MATCH_CONFIG_PATH,
  fileName: CONFIG_FILE_NAME,
  overrideLabel: 'external match ids',
}) {
  /** How many matches to sample per stratum, per source. */
  getMatchesPerStratum(): number {
    return this.positiveInteger(
      'matchesPerStratum',
      DEFAULT_MATCHES_PER_STRATUM,
    );
  }
}

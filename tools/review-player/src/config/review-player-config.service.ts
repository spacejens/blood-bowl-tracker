import { resolve } from 'node:path';

import { createReviewConfigServiceBase } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

/** DI token carrying the absolute path to the JSON5 config file. */
export const REVIEW_PLAYER_CONFIG_PATH = Symbol('REVIEW_PLAYER_CONFIG_PATH');

const CONFIG_FILE_NAME = 'review-player-config.json5';

/**
 * Default config-file location: `review-player-config.json5` in the current
 * working directory. The tool is run from `tools/review-player/`, so this
 * resolves to that directory's file.
 */
export const DEFAULT_REVIEW_PLAYER_CONFIG_PATH = resolve(
  process.cwd(),
  CONFIG_FILE_NAME,
);

const DEFAULT_PLAYERS_PER_STRATUM = 3;

/**
 * review-player's config: the shared review-harness getters (database url,
 * data dirs, external system names, overrides, output path) plus the one
 * setting only this tool has.
 */
@Injectable()
export class ReviewPlayerConfigService extends createReviewConfigServiceBase({
  pathToken: REVIEW_PLAYER_CONFIG_PATH,
  fileName: CONFIG_FILE_NAME,
  overrideLabel: 'external player ids',
}) {
  /** How many players the random-sample stratum picks, per source. */
  getPlayersPerStratum(): number {
    return this.positiveInteger(
      'playersPerStratum',
      DEFAULT_PLAYERS_PER_STRATUM,
    );
  }
}

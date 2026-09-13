import { resolve } from 'node:path';

import { createReviewConfigServiceBase } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

/** DI token carrying the absolute path to the JSON5 config file. */
export const REVIEW_STAR_PLAYER_CONFIG_PATH = Symbol(
  'REVIEW_STAR_PLAYER_CONFIG_PATH',
);

/** File name this tool's config lives in, named in every error about it. */
export const CONFIG_FILE_NAME = 'review-star-player-config.json5';

/**
 * Default config-file location: `review-star-player-config.json5` in the
 * current working directory. The tool is run from
 * `tools/review-star-player/`, so this resolves to that directory's file.
 */
export const DEFAULT_REVIEW_STAR_PLAYER_CONFIG_PATH = resolve(
  process.cwd(),
  CONFIG_FILE_NAME,
);

const DEFAULT_STARS_PER_STRATUM = 3;

/**
 * review-star-player's config: the shared review-harness getters (database
 * url, data dirs, external system names, overrides, output path) plus the one
 * setting only this tool has. `overrides.bbl` entries are BBL typIDs,
 * `overrides.tp` entries are TP's own spelling of the star's name (its
 * `tourplay.net` external id), and `overrides.manual` entries are the star's
 * stored name — hence the three-part override label.
 */
@Injectable()
export class StarPlayerReviewConfigService extends createReviewConfigServiceBase(
  {
    pathToken: REVIEW_STAR_PLAYER_CONFIG_PATH,
    fileName: CONFIG_FILE_NAME,
    overrideLabel:
      'BBL typIDs, TP star player names, or (for manual) the stored star player name',
  },
) {
  /** How many star players each stratum picks. */
  getStarsPerStratum(): number {
    return this.positiveInteger('starsPerStratum', DEFAULT_STARS_PER_STRATUM);
  }
}

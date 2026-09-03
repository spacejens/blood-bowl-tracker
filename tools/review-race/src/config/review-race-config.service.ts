import { resolve } from 'node:path';

import { ReviewConfigServiceBase } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

/** DI token carrying the absolute path to the JSON5 config file. */
export const REVIEW_RACE_CONFIG_PATH = Symbol('REVIEW_RACE_CONFIG_PATH');

const CONFIG_FILE_NAME = 'review-race-config.json5';

/**
 * Default config-file location: `review-race-config.json5` in the current
 * working directory. The tool is run from `tools/review-race/`, so this
 * resolves to that directory's file.
 */
export const DEFAULT_REVIEW_RACE_CONFIG_PATH = resolve(
  process.cwd(),
  CONFIG_FILE_NAME,
);

const DEFAULT_RACES_PER_STRATUM = 3;

/**
 * review-race's config: the shared review-harness getters (database url, data
 * dirs, external system names, overrides, output path) plus the one setting
 * only this tool has. `overrides.bbl`/`overrides.tp` are external race ids;
 * `overrides.manual` is the race's own name, since the hand-curated data has
 * no external-id space of its own — hence the two-part override label.
 */
@Injectable()
export class RaceReviewConfigService extends ReviewConfigServiceBase {
  constructor(@Inject(REVIEW_RACE_CONFIG_PATH) filePath: string) {
    super({
      filePath,
      fileName: CONFIG_FILE_NAME,
      overrideLabel: 'external race ids (race names, for manual)',
    });
  }

  /** How many races each stratum picks, per source. */
  getRacesPerStratum(): number {
    return this.positiveInteger('racesPerStratum', DEFAULT_RACES_PER_STRATUM);
  }
}

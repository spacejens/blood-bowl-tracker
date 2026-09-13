import { Injectable } from '@nestjs/common';

import type { StarPlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledStarPlayer } from '../shared/review.types';
import { HireEligibilityDbRendererService } from './hire-eligibility-db-renderer.service';
import { HireEligibilityRawRendererService } from './hire-eligibility-raw-renderer.service';

/**
 * The hire-eligibility data type: which races/rosters/eras each source, and
 * `positions_race_eras`, say may hire this star. A star has no single
 * source, so all raw sub-sections are rendered together in one panel.
 */
@Injectable()
export class HireEligibilityReviewerService implements StarPlayerDataTypeReviewer {
  readonly id = 'star-player-hire-eligibility';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported hire eligibility (database)';

  constructor(
    private readonly raw: HireEligibilityRawRendererService,
    private readonly imported: HireEligibilityDbRendererService,
  ) {}

  getRawSource(star: SampledStarPlayer): Promise<string> {
    return this.raw.render(star);
  }

  getImportedView(star: SampledStarPlayer): Promise<string> {
    return this.imported.render(star);
  }
}

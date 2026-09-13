import { Injectable } from '@nestjs/common';

import type { StarPlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerCharacteristicsDbRendererService } from './characteristics-db-renderer.service';
import { StarPlayerCharacteristicsRawRendererService } from './characteristics-raw-renderer.service';

/**
 * The star-characteristics data type: each source's own MA/ST/AG/PA/AV for
 * this star, beside what `position_rules_sets` stores. A star has no single
 * source, so all three raw sub-sections are rendered together in one panel.
 */
@Injectable()
export class StarPlayerCharacteristicsReviewerService implements StarPlayerDataTypeReviewer {
  readonly id = 'star-player-characteristics';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported characteristics (database)';

  constructor(
    private readonly raw: StarPlayerCharacteristicsRawRendererService,
    private readonly imported: StarPlayerCharacteristicsDbRendererService,
  ) {}

  getRawSource(star: SampledStarPlayer): Promise<string> {
    return this.raw.render(star);
  }

  getImportedView(star: SampledStarPlayer): Promise<string> {
    return this.imported.render(star);
  }
}

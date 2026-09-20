import { Injectable } from '@nestjs/common';

import type { StarPlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerKeywordsDbRendererService } from './star-player-keywords-db-renderer.service';
import { StarPlayerKeywordsRawRendererService } from './star-player-keywords-raw-renderer.service';

/**
 * The star-keywords data type: which BB2025 keywords TP lists for this star,
 * next to what the database recorded.
 *
 * Only TP publishes keywords at all -- BBL has no such concept -- so the raw
 * panel names TP and the curated catalogue rather than all three sources.
 */
@Injectable()
export class StarPlayerKeywordsReviewerService implements StarPlayerDataTypeReviewer {
  readonly id = 'star-player-keywords';
  readonly rawPanelLabel = 'Raw sources (TP codes / manual curation)';
  readonly importedPanelLabel = 'Imported keywords (database)';

  constructor(
    private readonly raw: StarPlayerKeywordsRawRendererService,
    private readonly imported: StarPlayerKeywordsDbRendererService,
  ) {}

  getRawSource(star: SampledStarPlayer): Promise<string> {
    return this.raw.render(star);
  }

  getImportedView(star: SampledStarPlayer): Promise<string> {
    return this.imported.render(star);
  }
}

import { Injectable } from '@nestjs/common';

import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledRace } from '../shared/review.types';
import { PositionKeywordsDbRendererService } from './position-keywords-db-renderer.service';
import { PositionKeywordsRawRendererService } from './position-keywords-raw-renderer.service';

/**
 * The position-keywords data type: which BB2025 keywords TP lists for a
 * race's positions, next to what the database recorded.
 *
 * Only TP publishes keywords at all -- BBL has no such concept -- so the raw
 * panel names TP and the curated catalogue rather than all three sources.
 */
@Injectable()
export class PositionKeywordsReviewerService implements RaceDataTypeReviewer {
  readonly id = 'position-keywords';
  readonly rawPanelLabel = 'Raw sources (TP codes / manual curation)';
  readonly importedPanelLabel = 'Imported keywords (database)';

  constructor(
    private readonly raw: PositionKeywordsRawRendererService,
    private readonly imported: PositionKeywordsDbRendererService,
  ) {}

  getRawSource(race: SampledRace): Promise<string> {
    return this.raw.render(race);
  }

  getImportedView(race: SampledRace): Promise<string> {
    return this.imported.render(race);
  }
}

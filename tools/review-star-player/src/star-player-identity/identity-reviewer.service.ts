import { Injectable } from '@nestjs/common';

import type { StarPlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerIdentityDbRendererService } from './identity-db-renderer.service';
import { StarPlayerIdentityRawRendererService } from './identity-raw-renderer.service';

/**
 * The star-identity data type: what each source calls this star and what it
 * costs there, beside the `positions` row and external ids the importers
 * stored. A star has no single source, so all three raw sub-sections are
 * rendered together in one panel.
 */
@Injectable()
export class StarPlayerIdentityReviewerService implements StarPlayerDataTypeReviewer {
  readonly id = 'star-player-identity';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported (database)';

  constructor(
    private readonly raw: StarPlayerIdentityRawRendererService,
    private readonly imported: StarPlayerIdentityDbRendererService,
  ) {}

  getRawSource(star: SampledStarPlayer): Promise<string> {
    return this.raw.render(star);
  }

  getImportedView(star: SampledStarPlayer): Promise<string> {
    return this.imported.render(star);
  }
}

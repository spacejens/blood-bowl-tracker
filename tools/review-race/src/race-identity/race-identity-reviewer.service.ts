import { Injectable } from '@nestjs/common';

import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledRace } from '../shared/review.types';
import { RaceIdentityDbRendererService } from './race-identity-db-renderer.service';
import { RaceIdentityRawRendererService } from './race-identity-raw-renderer.service';

/**
 * The race-identity data type: what each source calls this race and how much
 * of it each carries, beside the race row, eras and external ids the importers
 * stored. Unlike review-player's reviewers, the raw side is not chosen by the
 * sampled entity's source — a race has no single source, so all three are
 * rendered together in one panel.
 */
@Injectable()
export class RaceIdentityReviewerService implements RaceDataTypeReviewer {
  readonly id = 'race-identity';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported (database)';

  constructor(
    private readonly raw: RaceIdentityRawRendererService,
    private readonly imported: RaceIdentityDbRendererService,
  ) {}

  getRawSource(race: SampledRace): Promise<string> {
    return this.raw.render(race);
  }

  getImportedView(race: SampledRace): Promise<string> {
    return this.imported.render(race);
  }
}

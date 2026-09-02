import { Injectable } from '@nestjs/common';

import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledRace } from '../shared/review.types';
import { PositionAvailabilityDbRendererService } from './position-availability-db-renderer.service';
import { PositionAvailabilityRawRendererService } from './position-availability-raw-renderer.service';

/**
 * The position-availability data type: which positions each source, and the
 * database, say this race can field. As with race-identity, a race has no
 * single source, so all three raw sub-sections are rendered together in one
 * panel rather than one being chosen by the sampled entity's source.
 */
@Injectable()
export class PositionAvailabilityReviewerService implements RaceDataTypeReviewer {
  readonly id = 'position-availability';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported availability (database)';

  constructor(
    private readonly raw: PositionAvailabilityRawRendererService,
    private readonly imported: PositionAvailabilityDbRendererService,
  ) {}

  getRawSource(race: SampledRace): Promise<string> {
    return this.raw.render(race);
  }

  getImportedView(race: SampledRace): Promise<string> {
    return this.imported.render(race);
  }
}

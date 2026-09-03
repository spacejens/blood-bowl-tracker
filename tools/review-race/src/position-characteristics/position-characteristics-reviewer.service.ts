import { Injectable } from '@nestjs/common';

import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledRace } from '../shared/review.types';
import { PositionCharacteristicsDbRendererService } from './position-characteristics-db-renderer.service';
import { PositionCharacteristicsRawRendererService } from './position-characteristics-raw-renderer.service';

/**
 * The position-characteristics data type: which MA/ST/AG/PA/AV values each
 * source, and the database, say a race's positions have. As with the other
 * two race-scoped modules, a race has no single source, so all three raw
 * sub-sections are rendered together in one panel.
 */
@Injectable()
export class PositionCharacteristicsReviewerService implements RaceDataTypeReviewer {
  readonly id = 'position-characteristics';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported characteristics (database)';

  constructor(
    private readonly raw: PositionCharacteristicsRawRendererService,
    private readonly imported: PositionCharacteristicsDbRendererService,
  ) {}

  getRawSource(race: SampledRace): Promise<string> {
    return this.raw.render(race);
  }

  getImportedView(race: SampledRace): Promise<string> {
    return this.imported.render(race);
  }
}

import { Injectable } from '@nestjs/common';

import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledRace } from '../shared/review.types';
import { PositionStartingSkillsDbRendererService } from './position-starting-skills-db-renderer.service';
import { PositionStartingSkillsRawRendererService } from './position-starting-skills-raw-renderer.service';

/**
 * The position-starting-skills data type: which skills each source, and the
 * database, say a race's positions start with. As with the other race-scoped
 * modules, a race has no single source, so all three raw sub-sections are
 * rendered together in one panel.
 */
@Injectable()
export class PositionStartingSkillsReviewerService implements RaceDataTypeReviewer {
  readonly id = 'position-starting-skills';
  readonly rawPanelLabel = 'Raw sources (BBL / TP / manual curation)';
  readonly importedPanelLabel = 'Imported starting skills (database)';

  constructor(
    private readonly raw: PositionStartingSkillsRawRendererService,
    private readonly imported: PositionStartingSkillsDbRendererService,
  ) {}

  getRawSource(race: SampledRace): Promise<string> {
    return this.raw.render(race);
  }

  getImportedView(race: SampledRace): Promise<string> {
    return this.imported.render(race);
  }
}

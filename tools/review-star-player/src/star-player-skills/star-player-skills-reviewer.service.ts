import { Injectable } from '@nestjs/common';

import type { StarPlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerSkillsDbRendererService } from './star-player-skills-db-renderer.service';
import { StarPlayerSkillsRawRendererService } from './star-player-skills-raw-renderer.service';

/**
 * The star-skills data type: BBL's and TP's own starting-skill lists for this
 * star, beside what `position_rules_set_skills` stores. The curated files do
 * not carry star starting skills, so unlike the characteristics panel this
 * one has two raw sub-sections, not three.
 */
@Injectable()
export class StarPlayerSkillsReviewerService implements StarPlayerDataTypeReviewer {
  readonly id = 'star-player-skills';
  readonly rawPanelLabel = 'Raw sources (BBL / TP)';
  readonly importedPanelLabel = 'Imported starting skills (database)';

  constructor(
    private readonly raw: StarPlayerSkillsRawRendererService,
    private readonly imported: StarPlayerSkillsDbRendererService,
  ) {}

  getRawSource(star: SampledStarPlayer): Promise<string> {
    return this.raw.render(star);
  }

  getImportedView(star: SampledStarPlayer): Promise<string> {
    return this.imported.render(star);
  }
}

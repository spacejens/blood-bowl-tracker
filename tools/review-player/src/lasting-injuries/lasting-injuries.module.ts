import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblLastingInjuriesRawRendererService } from './bbl-lasting-injuries-raw-renderer.service';
import { CurrentInjuryStratificationService } from './current-injury-stratification.service';
import { HealedInjuryStratificationService } from './healed-injury-stratification.service';
import { LastingInjuriesDbRendererService } from './lasting-injuries-db-renderer.service';
import { LastingInjuriesReviewerService } from './lasting-injuries-reviewer.service';
import { TpLastingInjuriesRawRendererService } from './tp-lasting-injuries-raw-renderer.service';

/**
 * The lasting-injuries data type: raw panels from each source's own view of
 * what is currently outstanding for a player, an imported panel showing the
 * six stored columns, and two strata — players who currently carry an injury,
 * and players whose injury has since healed (the latter being this
 * codebase's first reader of a `*_history` table).
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblLastingInjuriesRawRendererService,
    CurrentInjuryStratificationService,
    HealedInjuryStratificationService,
    LastingInjuriesDbRendererService,
    LastingInjuriesReviewerService,
    TpLastingInjuriesRawRendererService,
  ],
  exports: [
    CurrentInjuryStratificationService,
    HealedInjuryStratificationService,
    LastingInjuriesReviewerService,
  ],
})
export class LastingInjuriesModule {}

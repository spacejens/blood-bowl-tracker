import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { SourceModule } from '../source/source.module';
import { BblLastingInjuriesRawRendererService } from './bbl-lasting-injuries-raw-renderer.service';
import { LastingInjuriesDbRendererService } from './lasting-injuries-db-renderer.service';
import { LastingInjuriesReviewerService } from './lasting-injuries-reviewer.service';
import { TpLastingInjuriesRawRendererService } from './tp-lasting-injuries-raw-renderer.service';

/**
 * The lasting-injuries data type: raw panels from each source's own view of
 * what is currently outstanding for a player, and an imported panel showing
 * the six stored columns. Task 16 adds this module's two strata.
 */
@Module({
  imports: [SharedModule, SourceModule],
  providers: [
    BblLastingInjuriesRawRendererService,
    LastingInjuriesDbRendererService,
    LastingInjuriesReviewerService,
    TpLastingInjuriesRawRendererService,
  ],
  exports: [LastingInjuriesReviewerService],
})
export class LastingInjuriesModule {}

import { Module } from '@nestjs/common';

import { PlayerInfoModule } from '../player-info/player-info.module';
import { PlayerKeywordsModule } from '../player-keywords/player-keywords.module';
import { PlayerStatusModule } from '../player-status/player-status.module';
import { SharedModule } from '../shared/shared.module';
import { PlayerOverviewReviewerService } from './player-overview-reviewer.service';

/**
 * The overview panel pair: one reviewer stacking the identity, status and
 * keyword renderers its three feature modules export.
 */
@Module({
  imports: [
    SharedModule,
    PlayerInfoModule,
    PlayerStatusModule,
    PlayerKeywordsModule,
  ],
  providers: [PlayerOverviewReviewerService],
  exports: [PlayerOverviewReviewerService],
})
export class OverviewModule {}

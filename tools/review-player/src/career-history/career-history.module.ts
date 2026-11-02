import { Module } from '@nestjs/common';

import { AdvancementCostsModule } from '../advancement-costs/advancement-costs.module';
import { LastingInjuriesModule } from '../lasting-injuries/lasting-injuries.module';
import { PlayerAdvancementsModule } from '../player-advancements/player-advancements.module';
import { PlayerCharacteristicsModule } from '../player-characteristics/player-characteristics.module';
import { SharedModule } from '../shared/shared.module';
import { SppTotalsModule } from '../spp-totals/spp-totals.module';
import { PlayerCareerHistoryReviewerService } from './player-career-history-reviewer.service';

/**
 * The career-history panel pair: one reviewer stacking the SPP, advancement,
 * characteristics and lasting-injuries renderers its feature modules export.
 */
@Module({
  imports: [
    SharedModule,
    SppTotalsModule,
    PlayerAdvancementsModule,
    AdvancementCostsModule,
    PlayerCharacteristicsModule,
    LastingInjuriesModule,
  ],
  providers: [PlayerCareerHistoryReviewerService],
  exports: [PlayerCareerHistoryReviewerService],
})
export class CareerHistoryModule {}

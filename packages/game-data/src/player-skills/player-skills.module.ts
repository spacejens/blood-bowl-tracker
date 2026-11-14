import { Module } from '@nestjs/common';

import { CharacteristicAdvancementPlannerService } from './characteristic-advancement-planner.service';
import { JourneymanLonerService } from './journeyman-loner.service';
import { PaidAdvancementSlotsService } from './paid-advancement-slots.service';
import { PlayerAdvancementReadsService } from './player-advancement-reads.service';
import { PlayerAdvancementSyncPlannerService } from './player-advancement-sync-planner.service';
import { PlayerSkillsService } from './player-skills.service';

@Module({
  providers: [
    PlayerSkillsService,
    PlayerAdvancementReadsService,
    PlayerAdvancementSyncPlannerService,
    CharacteristicAdvancementPlannerService,
    PaidAdvancementSlotsService,
    JourneymanLonerService,
  ],
  exports: [
    PlayerSkillsService,
    PlayerAdvancementReadsService,
    JourneymanLonerService,
  ],
})
export class PlayerSkillsModule {}

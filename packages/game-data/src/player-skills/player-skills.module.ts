import { Module } from '@nestjs/common';

import { CharacteristicAdvancementPlannerService } from './characteristic-advancement-planner.service';
import { PlayerSkillsService } from './player-skills.service';

@Module({
  providers: [PlayerSkillsService, CharacteristicAdvancementPlannerService],
  exports: [PlayerSkillsService],
})
export class PlayerSkillsModule {}

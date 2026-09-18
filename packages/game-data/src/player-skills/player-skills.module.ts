import { Module } from '@nestjs/common';

import { PlayerSkillsService } from './player-skills.service';

@Module({
  providers: [PlayerSkillsService],
  exports: [PlayerSkillsService],
})
export class PlayerSkillsModule {}

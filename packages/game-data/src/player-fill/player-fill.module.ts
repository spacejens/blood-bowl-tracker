import { Module } from '@nestjs/common';

import { PlayerSkillsModule } from '../player-skills/player-skills.module';
import { PlayersModule } from '../players/players.module';
import { SppModule } from '../spp/spp.module';
import { PlayerFillService } from './player-fill.service';
import { PlayerFillComparisonService } from './player-fill-comparison.service';
import { PlayerFillEntriesService } from './player-fill-entries.service';
import { PlayerFillSpendCheckService } from './player-fill-spend-check.service';
import { PlayerFillStateService } from './player-fill-state.service';

@Module({
  imports: [PlayersModule, PlayerSkillsModule, SppModule],
  providers: [
    PlayerFillService,
    PlayerFillComparisonService,
    PlayerFillEntriesService,
    PlayerFillSpendCheckService,
    PlayerFillStateService,
  ],
  exports: [PlayerFillService],
})
export class PlayerFillModule {}

import { Module } from '@nestjs/common';

import { PlayerSkillsModule } from '../player-skills/player-skills.module';
import { PlayersModule } from '../players/players.module';
import { PositionRulesSetsModule } from '../position-rules-sets/position-rules-sets.module';
import { SppModule } from '../spp/spp.module';
import { PlayerFillService } from './player-fill.service';
import { PlayerFillComparisonService } from './player-fill-comparison.service';
import { PlayerFillEntriesService } from './player-fill-entries.service';
import { PlayerFillReductionsService } from './player-fill-reductions.service';
import { PlayerFillReductionsRecordService } from './player-fill-reductions-record.service';
import { PlayerFillSpendCheckService } from './player-fill-spend-check.service';
import { PlayerFillStateService } from './player-fill-state.service';

@Module({
  imports: [
    PlayersModule,
    PlayerSkillsModule,
    PositionRulesSetsModule,
    SppModule,
  ],
  providers: [
    PlayerFillService,
    PlayerFillComparisonService,
    PlayerFillEntriesService,
    PlayerFillReductionsService,
    PlayerFillReductionsRecordService,
    PlayerFillSpendCheckService,
    PlayerFillStateService,
  ],
  exports: [PlayerFillService, PlayerFillReductionsRecordService],
})
export class PlayerFillModule {}

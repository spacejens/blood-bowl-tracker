import {
  TrophiesModule,
  TrophyAwardsModule,
} from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import { TrophyDeepdiveService } from '../deepdive/facts/trophy-deepdive.service';
import { InsightsModule } from '../insights/insights.module';
import { DeepdiveCommandService } from './deepdive-command.service';
import { InsightsCommandService } from './insights-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

@Module({
  // InsightsModule re-exports the game-data modules the other deepdives need;
  // trophies and trophy awards are used only here, so they are imported
  // directly rather than widening the insights surface.
  imports: [InsightsModule, TrophiesModule, TrophyAwardsModule],
  providers: [
    InsightsCommandService,
    DeepdiveCommandService,
    SlashCommandRegistryService,
    CoachDeepdiveService,
    TeamDeepdiveService,
    RaceDeepdiveService,
    PlayerDeepdiveService,
    CompetitionDeepdiveService,
    EraDeepdiveService,
    TrophyDeepdiveService,
  ],
  exports: [InsightsCommandService, SlashCommandRegistryService],
})
export class SlashCommandsModule {}

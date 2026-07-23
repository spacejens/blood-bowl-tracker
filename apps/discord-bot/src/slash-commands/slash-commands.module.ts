import { Module } from '@nestjs/common';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import { InsightsModule } from '../insights/insights.module';
import { DeepdiveCommandService } from './deepdive-command.service';
import { InsightsCommandService } from './insights-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

@Module({
  imports: [InsightsModule],
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
  ],
  exports: [InsightsCommandService],
})
export class SlashCommandsModule {}

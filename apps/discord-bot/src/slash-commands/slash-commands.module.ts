import {
  TrophiesModule,
  TrophyAwardsModule,
} from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { CompetitionGroupDeepdiveService } from '../deepdive/facts/competition-group-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { PlayerKillsSectionService } from '../deepdive/facts/player-kills-section.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { StarPlayerDeepdiveService } from '../deepdive/facts/star-player-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import { TrophyDeepdiveService } from '../deepdive/facts/trophy-deepdive.service';
import { PlayerRowButtonService } from '../deepdive/player-row-button.service';
import { InsightsModule } from '../insights/insights.module';
import { DeepdiveAutocompleteService } from './deepdive-autocomplete.service';
import { DeepdiveCommandService } from './deepdive-command.service';
import { DeepdiveTargetResolverService } from './deepdive-target-resolver.service';
import { InsightsCommandService } from './insights-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

@Module({
  // InsightsModule re-exports the game-data modules the other deepdives need;
  // trophies and trophy awards are used only here, so they are imported
  // directly rather than widening the insights surface. Competition groups
  // now arrive transitively through InsightsModule (it needs
  // CompetitionGroupsService itself, for the competitionGroups.list fact).
  imports: [InsightsModule, TrophiesModule, TrophyAwardsModule],
  providers: [
    InsightsCommandService,
    DeepdiveAutocompleteService,
    DeepdiveCommandService,
    DeepdiveTargetResolverService,
    SlashCommandRegistryService,
    PlayerRowButtonService,
    CoachDeepdiveService,
    TeamDeepdiveService,
    RaceDeepdiveService,
    PlayerDeepdiveService,
    StarPlayerDeepdiveService,
    PlayerKillsSectionService,
    CompetitionDeepdiveService,
    CompetitionGroupDeepdiveService,
    EraDeepdiveService,
    TrophyDeepdiveService,
  ],
  exports: [InsightsCommandService, SlashCommandRegistryService],
})
export class SlashCommandsModule {}

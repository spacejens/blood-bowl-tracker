import {
  TrophiesModule,
  TrophyAwardsModule,
} from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { CoachDeepdiveService } from '../deepdive/facts/coach-deepdive.service';
import { CompetitionDeepdiveService } from '../deepdive/facts/competition-deepdive.service';
import { CompetitionGroupDeepdiveService } from '../deepdive/facts/competition-group-deepdive.service';
import { EraDeepdiveService } from '../deepdive/facts/era-deepdive.service';
import { LeagueDeepdiveService } from '../deepdive/facts/league-deepdive.service';
import { PlayerDeepdiveService } from '../deepdive/facts/player-deepdive.service';
import { PlayerKillsSectionService } from '../deepdive/facts/player-kills-section.service';
import { PositionCharacteristicsLineFormatterService } from '../deepdive/facts/position-characteristics-line-formatter.service';
import { PositionDeepdiveService } from '../deepdive/facts/position-deepdive.service';
import { RaceDeepdiveService } from '../deepdive/facts/race-deepdive.service';
import { StarPlayerDeepdiveService } from '../deepdive/facts/star-player-deepdive.service';
import { TeamDeepdiveService } from '../deepdive/facts/team-deepdive.service';
import { TrophyDeepdiveService } from '../deepdive/facts/trophy-deepdive.service';
import { InsightsModule } from '../insights/insights.module';
import { DeepdiveAutocompleteService } from './deepdive-autocomplete.service';
import { DeepdiveCommandService } from './deepdive-command.service';
import { DeepdiveTargetResolverService } from './deepdive-target-resolver.service';
import { InsightsCommandService } from './insights-command.service';
import { OnThisDateCommandService } from './on-this-date-command.service';
import { SlashCommandRegistryService } from './slash-command-registry.service';

@Module({
  // InsightsModule re-exports the game-data modules the other deepdives need;
  // trophies and trophy awards are used only here, so they are imported
  // directly rather than widening the insights surface. Competition groups
  // now arrive transitively through InsightsModule (it needs
  // CompetitionGroupsService itself, for the competitionGroups.list fact).
  // PlayerRowButtonService and PlayerKillerInfoFormatterService also arrive
  // transitively through InsightsModule, which provides and exports both for
  // its own on-this-date insight, so neither is redeclared here.
  imports: [InsightsModule, TrophiesModule, TrophyAwardsModule],
  providers: [
    InsightsCommandService,
    OnThisDateCommandService,
    DeepdiveAutocompleteService,
    DeepdiveCommandService,
    DeepdiveTargetResolverService,
    SlashCommandRegistryService,
    CoachDeepdiveService,
    TeamDeepdiveService,
    RaceDeepdiveService,
    PositionCharacteristicsLineFormatterService,
    PositionDeepdiveService,
    PlayerDeepdiveService,
    StarPlayerDeepdiveService,
    PlayerKillsSectionService,
    CompetitionDeepdiveService,
    CompetitionGroupDeepdiveService,
    EraDeepdiveService,
    TrophyDeepdiveService,
    LeagueDeepdiveService,
  ],
  exports: [InsightsCommandService, SlashCommandRegistryService],
})
export class SlashCommandsModule {}

import {
  CoachesModule,
  CompetitionGroupsModule,
  CompetitionsModule,
  DateToplistModule,
  ErasModule,
  ExternalSystemsModule,
  LeaguesModule,
  MatchesModule,
  OnThisDateModule,
  PlayersModule,
  PositionsModule,
  RacesModule,
  RulesSetsModule,
  TeamsModule,
  TrophiesModule,
} from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { DatabaseTimeoutService } from '../database-timeout.service';
import { PlayerKillerInfoFormatterService } from '../deepdive/facts/player-killer-info-formatter.service';
import { PlayerRowButtonService } from '../deepdive/player-row-button.service';
import { EntityComponentsService } from '../entity-components.service';
import { ClockService } from '../shared/clock.service';
import { DateButtonIdService } from '../shared/date-button-id.service';
import { DateRangeFormatterService } from '../shared/date-range-formatter.service';
import { EraSectionGrouperService } from '../shared/era-section-grouper.service';
import { EventCountLinesService } from '../shared/event-count-lines.service';
import { ListDescriptionService } from '../shared/list-description.service';
import { MonthDayService } from '../shared/month-day.service';
import { DayCountFormatterService } from './day-count-formatter.service';
import { FACT_TREE } from './fact-tree.token';
import { FactTreeFactoryService } from './fact-tree-factory.service';
import { FactTreeUtilsService } from './fact-tree-utils.service';
import { CoachToplistService } from './facts/coach-toplist.service';
import { CompetitionGroupsListService } from './facts/competition-groups-list.service';
import { DateToplistFactsService } from './facts/date-toplist.service';
import { ErasListService } from './facts/eras-list.service';
import { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import { MatchCategoryLabelService } from './facts/match-category-label.service';
import { OnThisDateFactsService } from './facts/on-this-date.service';
import { PlayerToplistService } from './facts/player-toplist.service';
import { RaceToplistService } from './facts/race-toplist.service';
import { StarPlayerToplistService } from './facts/star-player-toplist.service';
import { StarPlayersListService } from './facts/star-players-list.service';
import { StatsSummaryFactsService } from './facts/stats-summary.service';
import { TeamToplistService } from './facts/team-toplist.service';
import { ToplistFactoryService } from './facts/toplist-factory.service';
import { TrophiesListService } from './facts/trophies-list.service';
import { LeaderboardService } from './leaderboard.service';
import { PlayerContextService } from './player-context.service';
import { RandomInsightsScopeService } from './random-insights-scope.service';
import { RandomSourceService } from './random-source.service';
import { TeamContextService } from './team-context.service';

const GAME_DATA_MODULES = [
  CoachesModule,
  CompetitionGroupsModule,
  TeamsModule,
  MatchesModule,
  CompetitionsModule,
  LeaguesModule,
  RulesSetsModule,
  ErasModule,
  DateToplistModule,
  OnThisDateModule,
  PlayersModule,
  PositionsModule,
  RacesModule,
  ExternalSystemsModule,
  TrophiesModule,
];

@Module({
  imports: GAME_DATA_MODULES,
  providers: [
    DatabaseTimeoutService,
    EntityComponentsService,
    PlayerRowButtonService,
    PlayerKillerInfoFormatterService,
    LeaderboardService,
    ToplistFactoryService,
    TeamContextService,
    PlayerContextService,
    DayCountFormatterService,
    DateRangeFormatterService,
    EraSectionGrouperService,
    EventCountLinesService,
    ListDescriptionService,
    ClockService,
    MonthDayService,
    DateButtonIdService,
    FactTreeFactoryService,
    FactTreeUtilsService,
    RandomSourceService,
    RandomInsightsScopeService,
    CoachToplistService,
    RaceToplistService,
    TeamToplistService,
    PlayerToplistService,
    MatchCategoryLabelService,
    ExpensiveMistakesToplistService,
    ErasListService,
    CompetitionGroupsListService,
    StatsSummaryFactsService,
    StarPlayerToplistService,
    StarPlayersListService,
    TrophiesListService,
    OnThisDateFactsService,
    DateToplistFactsService,
    {
      provide: FACT_TREE,
      useFactory: (factory: FactTreeFactoryService) => factory.build(),
      inject: [FactTreeFactoryService],
    },
  ],
  exports: [
    ...GAME_DATA_MODULES,
    DatabaseTimeoutService,
    EntityComponentsService,
    PlayerRowButtonService,
    PlayerKillerInfoFormatterService,
    LeaderboardService,
    ToplistFactoryService,
    TeamContextService,
    PlayerContextService,
    DayCountFormatterService,
    DateRangeFormatterService,
    EraSectionGrouperService,
    EventCountLinesService,
    ListDescriptionService,
    ClockService,
    MonthDayService,
    DateButtonIdService,
    FactTreeUtilsService,
    RandomSourceService,
    RandomInsightsScopeService,
    CoachToplistService,
    RaceToplistService,
    TeamToplistService,
    PlayerToplistService,
    MatchCategoryLabelService,
    ExpensiveMistakesToplistService,
    ErasListService,
    CompetitionGroupsListService,
    StatsSummaryFactsService,
    StarPlayerToplistService,
    StarPlayersListService,
    TrophiesListService,
    OnThisDateFactsService,
    DateToplistFactsService,
    FACT_TREE,
  ],
})
export class InsightsModule {}

import type { FactScope } from '@blood-bowl-tracker/game-data';
import type { CoachAverageDirection } from '@blood-bowl-tracker/game-data-queries';
import {
  CoachAverageStatisticsService,
  CoachesQueriesService,
} from '@blood-bowl-tracker/game-data-queries';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  COACH_TOPLIST_NO_DATA_MESSAGE,
  COACH_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { NumberFormatterService } from '../../shared/number-formatter.service';
import type { EntityLink } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';
import type { ToplistResolver } from './toplist-factory.service';
import { ToplistFactoryService } from './toplist-factory.service';

type CoachToplistMethod =
  | 'countFoulsCommittedByCoach'
  | 'countTimesSentOffByCoach'
  | 'countTouchdownsScoredByCoach'
  | 'countCompletionsByCoach'
  | 'countInterceptionsByCoach'
  | 'countDeflectionsByCoach'
  | 'countCasualtiesCausedByCoach'
  | 'countSeriousInjuriesCausedByCoach'
  | 'countLastingInjuriesCausedByCoach'
  | 'countDeathsCausedByCoach'
  | 'countCasualtiesSufferedByCoach'
  | 'countSeriousInjuriesSufferedByCoach'
  | 'countLastingInjuriesSufferedByCoach'
  | 'countDeathsSufferedByCoach'
  | 'countMatchesPlayedByCoach'
  | 'countMatchesWonByCoach'
  | 'countMatchesLostByCoach'
  | 'countMatchesDrawnByCoach'
  | 'countTeamsByCoach'
  | 'countCompetitionsByCoach'
  | 'countTrophiesByCoach';

/** The `CoachAverageStatisticsService` per-match average queries; they share one signature. */
type CoachAverageMethod =
  | 'averageCasualtiesCausedByCoach'
  | 'averageCasualtiesSufferedByCoach'
  | 'averageSeriousInjuriesCausedByCoach'
  | 'averageSeriousInjuriesSufferedByCoach'
  | 'averageLastingInjuriesCausedByCoach'
  | 'averageLastingInjuriesSufferedByCoach'
  | 'averageDeathsCausedByCoach'
  | 'averageDeathsSufferedByCoach';

interface CoachCountRow {
  coachId: number;
  name: string;
  count: number;
}

@Injectable()
export class CoachToplistService {
  private readonly resolvers: Record<
    CoachToplistMethod,
    ToplistResolver<CoachesQueriesService>
  >;

  private readonly coachLink: EntityLink<{ coachId: number }> = {
    customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: { coachId: number }) => row.coachId,
  };

  constructor(
    private readonly coachesQueries: CoachesQueriesService,
    private readonly averages: CoachAverageStatisticsService,
    private readonly leaderboard: LeaderboardService,
    private readonly numbers: NumberFormatterService,
    private readonly toplistFactory: ToplistFactoryService,
  ) {
    this.resolvers = this.toplistFactory.makeResolvers<
      CoachToplistMethod,
      CoachesQueriesService,
      { coachId: number; name: string; count: number }
    >({
      titles: {
        countFoulsCommittedByCoach: 'Coaches by fouls committed',
        countTimesSentOffByCoach: 'Coaches by times sent off',
        countTouchdownsScoredByCoach: 'Coaches by touchdowns scored',
        countCompletionsByCoach: 'Coaches by completions',
        countInterceptionsByCoach: 'Coaches by interceptions',
        countDeflectionsByCoach: 'Coaches by deflections',
        countCasualtiesCausedByCoach: 'Coaches by casualties caused',
        countSeriousInjuriesCausedByCoach: 'Coaches by serious injuries caused',
        countLastingInjuriesCausedByCoach: 'Coaches by lasting injuries caused',
        countDeathsCausedByCoach: 'Coaches by deaths caused',
        countCasualtiesSufferedByCoach: 'Coaches by casualties suffered',
        countSeriousInjuriesSufferedByCoach:
          'Coaches by serious injuries suffered',
        countLastingInjuriesSufferedByCoach:
          'Coaches by lasting injuries suffered',
        countDeathsSufferedByCoach: 'Coaches by deaths suffered',
        countMatchesPlayedByCoach: 'Coaches by matches played',
        countMatchesWonByCoach: 'Coaches by matches won',
        countMatchesLostByCoach: 'Coaches by matches lost',
        countMatchesDrawnByCoach: 'Coaches by matches drawn',
        countTeamsByCoach: 'Coaches by teams coached',
        countCompetitionsByCoach: 'Coaches by competitions played',
        countTrophiesByCoach: 'Coaches by trophies won',
      },
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.coachLink,
    });
  }

  resolveFoulsCommitted(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countFoulsCommittedByCoach(
      this.coachesQueries,
      scope,
    );
  }

  resolveTimesSentOff(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countTimesSentOffByCoach(this.coachesQueries, scope);
  }

  resolveTouchdownsScored(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countTouchdownsScoredByCoach(
      this.coachesQueries,
      scope,
    );
  }

  resolveCompletions(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countCompletionsByCoach(this.coachesQueries, scope);
  }

  resolveInterceptions(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countInterceptionsByCoach(this.coachesQueries, scope);
  }

  resolveDeflections(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countDeflectionsByCoach(this.coachesQueries, scope);
  }

  resolveCasualtiesCaused(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countCasualtiesCausedByCoach(
      this.coachesQueries,
      scope,
    );
  }

  resolveSeriousInjuriesCaused(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countSeriousInjuriesCausedByCoach(
      this.coachesQueries,
      scope,
    );
  }

  resolveLastingInjuriesCaused(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countLastingInjuriesCausedByCoach(
      this.coachesQueries,
      scope,
    );
  }

  resolveDeathsCaused(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countDeathsCausedByCoach(this.coachesQueries, scope);
  }

  resolveCasualtiesSuffered(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countCasualtiesSufferedByCoach(
      this.coachesQueries,
      scope,
    );
  }

  resolveSeriousInjuriesSuffered(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countSeriousInjuriesSufferedByCoach(
      this.coachesQueries,
      scope,
    );
  }

  resolveLastingInjuriesSuffered(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countLastingInjuriesSufferedByCoach(
      this.coachesQueries,
      scope,
    );
  }

  resolveDeathsSuffered(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countDeathsSufferedByCoach(
      this.coachesQueries,
      scope,
    );
  }

  resolveMatchesPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countMatchesPlayedByCoach(this.coachesQueries, scope);
  }

  resolveMatchesWon(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countMatchesWonByCoach(this.coachesQueries, scope);
  }

  resolveMatchesLost(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countMatchesLostByCoach(this.coachesQueries, scope);
  }

  resolveMatchesDrawn(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countMatchesDrawnByCoach(this.coachesQueries, scope);
  }

  resolveTeams(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countTeamsByCoach(this.coachesQueries, scope);
  }

  resolveCompetitionsPlayed(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countCompetitionsByCoach(this.coachesQueries, scope);
  }

  /**
   * The only competition-scopable coach toplist: `CoachesQueriesService.countTrophiesByCoach`
   * forwards the competition, unlike the match-event-backed coach counts.
   * Rows need no decoration — bare coachId/name/count, like every other
   * factory-built coach toplist.
   */
  resolveTrophiesWon(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolvers.countTrophiesByCoach(this.coachesQueries, scope);
  }

  /**
   * Backed by `countErasByCoach`, which takes no `FactScope` at all (eras
   * active is inherently unscoped), so it does not fit the factory's
   * `(scope, limit)` shape and stays hand-written rather than widening its
   * query signature to accept a scope it would ignore.
   */
  resolveErasActive(): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<{
      coachId: number;
      name: string;
      count: number;
    }>({
      title: 'Coaches by eras active',
      fetchRows: (limit) => this.coachesQueries.countErasByCoach(limit),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.coachLink,
    });
  }

  /**
   * The three time-between-matches toplists are hand-written rather than
   * built by the toplist factory because each row renders as a duration
   * ("91 days") instead of a bare count, and the factory applies a single
   * formatRow across a whole titles table, which the count-rendered coach
   * toplists already occupy. Same precedent as
   * ExpensiveMistakesToplistService's `gp` rendering.
   */
  private resolveGapToplist(options: {
    title: string;
    fetchRows: (limit: number) => Promise<CoachCountRow[]>;
  }): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<CoachCountRow>({
      title: options.title,
      fetchRows: options.fetchRows,
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.coachLink,
      formatRow: (row) =>
        `${row.rank}. ${row.name} — ${this.numbers.counted(row.count, 'day')}`,
    });
  }

  resolveTimeBetweenMatchesDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveGapToplist({
      title: 'Coaches by longest time between matches (highest first)',
      fetchRows: (limit) =>
        this.coachesQueries.getGapBetweenMatchesByCoachDescending(scope, limit),
    });
  }

  /**
   * Ranks the same single-longest-gap metric ascending: the coaches whose
   * worst gap is smallest, i.e. the most consistently active ones.
   */
  resolveTimeBetweenMatchesAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveGapToplist({
      title: 'Coaches by longest time between matches (lowest first)',
      fetchRows: (limit) =>
        this.coachesQueries.getGapBetweenMatchesByCoachAscending(scope, limit),
    });
  }

  resolveAverageTimeBetweenMatches(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveGapToplist({
      title: 'Coaches by average time between matches',
      fetchRows: (limit) =>
        this.coachesQueries.getAverageGapBetweenMatchesByCoach(scope, limit),
    });
  }

  /**
   * Every per-match average toplist shares this builder; each differs only
   * in its measure, its backing `CoachAverageStatisticsService` query and
   * its direction. The average is carried as the row's `count` because the
   * leaderboard ranks ties on `count`; the query has already rounded it to
   * two decimals and applied the minimum-matches floor. Hand-written rather
   * than factory-built because it renders a two-decimal average instead of
   * a bare count, and passes a direction.
   */
  private resolveAverageToplist(options: {
    measure: string;
    method: CoachAverageMethod;
    scope: FactScope;
    direction: CoachAverageDirection;
  }): Promise<string | InteractionReplyOptions> {
    const { measure, method, scope, direction } = options;
    return this.leaderboard.resolveToplist<CoachCountRow>({
      title: `Coaches by average ${measure} per match (${direction === 'desc' ? 'highest' : 'lowest'} first)`,
      fetchRows: async (limit) =>
        (await this.averages[method](scope, direction, limit)).map(
          ({ average, ...row }) => ({ ...row, count: average }),
        ),
      timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.coachLink,
      formatRow: (row) =>
        `${row.rank}. ${row.name} — ${this.numbers.decimal(row.count)} per match`,
    });
  }

  resolveAverageCasualtiesCausedDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'casualties caused',
      method: 'averageCasualtiesCausedByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageCasualtiesCausedAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'casualties caused',
      method: 'averageCasualtiesCausedByCoach',
      scope,
      direction: 'asc',
    });
  }

  resolveAverageCasualtiesSufferedDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'casualties suffered',
      method: 'averageCasualtiesSufferedByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageCasualtiesSufferedAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'casualties suffered',
      method: 'averageCasualtiesSufferedByCoach',
      scope,
      direction: 'asc',
    });
  }

  resolveAverageSeriousInjuriesCausedDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'serious injuries caused',
      method: 'averageSeriousInjuriesCausedByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageSeriousInjuriesCausedAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'serious injuries caused',
      method: 'averageSeriousInjuriesCausedByCoach',
      scope,
      direction: 'asc',
    });
  }

  resolveAverageSeriousInjuriesSufferedDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'serious injuries suffered',
      method: 'averageSeriousInjuriesSufferedByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageSeriousInjuriesSufferedAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'serious injuries suffered',
      method: 'averageSeriousInjuriesSufferedByCoach',
      scope,
      direction: 'asc',
    });
  }

  resolveAverageLastingInjuriesCausedDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'lasting injuries caused',
      method: 'averageLastingInjuriesCausedByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageLastingInjuriesCausedAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'lasting injuries caused',
      method: 'averageLastingInjuriesCausedByCoach',
      scope,
      direction: 'asc',
    });
  }

  resolveAverageLastingInjuriesSufferedDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'lasting injuries suffered',
      method: 'averageLastingInjuriesSufferedByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageLastingInjuriesSufferedAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'lasting injuries suffered',
      method: 'averageLastingInjuriesSufferedByCoach',
      scope,
      direction: 'asc',
    });
  }

  resolveAverageDeathsCausedDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'deaths caused',
      method: 'averageDeathsCausedByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageDeathsCausedAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'deaths caused',
      method: 'averageDeathsCausedByCoach',
      scope,
      direction: 'asc',
    });
  }

  resolveAverageDeathsSufferedDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'deaths suffered',
      method: 'averageDeathsSufferedByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageDeathsSufferedAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'deaths suffered',
      method: 'averageDeathsSufferedByCoach',
      scope,
      direction: 'asc',
    });
  }
}

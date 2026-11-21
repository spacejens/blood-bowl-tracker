import type { FactScope } from '@blood-bowl-tracker/game-data';
import type { CoachAverageDirection } from '@blood-bowl-tracker/game-data-queries';
import { CoachAverageStatisticsService } from '@blood-bowl-tracker/game-data-queries';
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

/** The `CoachAverageStatisticsService` per-match average queries; they share one signature. */
type CoachAverageMethod =
  | 'averageTouchdownsScoredByCoach'
  | 'averageTouchdownsConcededByCoach'
  | 'averageCasualtiesCausedByCoach'
  | 'averageCasualtiesSufferedByCoach'
  | 'averageSeriousInjuriesCausedByCoach'
  | 'averageSeriousInjuriesSufferedByCoach'
  | 'averageLastingInjuriesCausedByCoach'
  | 'averageLastingInjuriesSufferedByCoach'
  | 'averageDeathsCausedByCoach'
  | 'averageDeathsSufferedByCoach';

interface CoachAverageToplistRow {
  coachId: number;
  name: string;
  count: number;
}

/**
 * The coach per-match average toplists, highest and lowest first. Kept
 * apart from `CoachToplistService`, which holds the coach count and
 * time-between-matches toplists; both link each row to the coach deepdive
 * and share the coach toplist timeout and no-data messages.
 */
@Injectable()
export class CoachAverageToplistService {
  private readonly coachLink: EntityLink<{ coachId: number }> = {
    customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: { coachId: number }) => row.coachId,
  };

  constructor(
    private readonly averages: CoachAverageStatisticsService,
    private readonly leaderboard: LeaderboardService,
    private readonly numbers: NumberFormatterService,
  ) {}

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
    return this.leaderboard.resolveToplist<CoachAverageToplistRow>({
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

  resolveAverageTouchdownsScoredDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'touchdowns scored',
      method: 'averageTouchdownsScoredByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageTouchdownsScoredAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'touchdowns scored',
      method: 'averageTouchdownsScoredByCoach',
      scope,
      direction: 'asc',
    });
  }

  resolveAverageTouchdownsConcededDescending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'touchdowns conceded',
      method: 'averageTouchdownsConcededByCoach',
      scope,
      direction: 'desc',
    });
  }

  resolveAverageTouchdownsConcededAscending(
    scope: FactScope,
  ): Promise<string | InteractionReplyOptions> {
    return this.resolveAverageToplist({
      measure: 'touchdowns conceded',
      method: 'averageTouchdownsConcededByCoach',
      scope,
      direction: 'asc',
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

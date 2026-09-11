import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  and,
  count,
  DB,
  eq,
  eras,
  isNotNull,
  matches,
  matchEvents,
  matchTeams,
  players,
  positions,
  sql,
  teamEras,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { MatchScopeFilterService } from '../shared/match-scope-filter.service';
import { TrophyRuleEventTypeFilterService } from './trophy-rule-event-type-filter.service';
import type {
  TrophyAwardRuleMeasure,
  TrophyAwardRuleRole,
  TrophyRuleEventTypes,
  TrophyRuleWinner,
} from './trophy-rule-types';

/**
 * One `career_threshold` rule evaluation. Unlike the two `max_*` kinds this is
 * scoped to the whole league rather than one competition: the threshold is a
 * lifetime achievement, merely *recorded* against whichever competition the
 * player happens to cross it in.
 */
export interface CareerThresholdRuleOptions {
  trophyId: number;
  leagueId: number;
  role: TrophyAwardRuleRole;
  types: TrophyRuleEventTypes;
  threshold: number;
  measure: TrophyAwardRuleMeasure;
}

@Injectable()
export class CareerThresholdTrophyRuleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly eventTypeFilter: TrophyRuleEventTypeFilterService,
    private readonly matchScopeFilter: MatchScopeFilterService,
  ) {}

  /**
   * Every non-star player whose league-wide cumulative figure has reached the
   * trophy's threshold and who has not already been given this trophy in an
   * earlier competition. Zero, one, or many recipients; there is no tie
   * cutoff, because a threshold is not a competition between players.
   *
   * Two queries rather than one `NOT EXISTS`: the prior-award set is a handful
   * of rows for the whole league, and keeping it separate makes the
   * one-award-per-player rule readable — and assertable — on its own.
   */
  async compute(
    options: CareerThresholdRuleOptions,
  ): Promise<TrophyRuleWinner[]> {
    const { trophyId, leagueId, role, types, threshold, measure } = options;
    const playerColumn =
      role === 'acting'
        ? matchEvents.actingPlayerId
        : matchEvents.consequencePlayerId;
    const matchTeamColumn =
      role === 'acting'
        ? matchEvents.actingMatchTeamId
        : matchEvents.consequenceMatchTeamId;
    const aggregate: SQL<number> =
      measure === 'spp_sum'
        ? sql<number>`coalesce(sum(${matchEvents.sppValue}), 0)::int`
        : sql<number>`${count(matchEvents.id)}`;

    const candidates = await this.db
      .select({ playerId: players.id, teamEraId: players.teamEraId })
      .from(matchEvents)
      .innerJoin(players, eq(players.id, playerColumn))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(matchTeams, eq(matchTeams.id, matchTeamColumn))
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(
        and(
          this.eventTypeFilter.buildAll(types),
          measure === 'spp_sum' ? isNotNull(matchEvents.sppValue) : undefined,
          eq(positions.isStarPlayer, false),
          this.matchScopeFilter.build({ leagueId }),
        ),
      )
      .groupBy(players.id, players.teamEraId)
      .having(sql`${aggregate} >= ${threshold}`);

    const alreadyAwarded = await this.db
      .selectDistinct({ playerId: trophyAwards.playerId })
      .from(trophyAwards)
      .where(eq(trophyAwards.trophyId, trophyId));

    const awardedIds = new Set(
      alreadyAwarded
        .map((row) => row.playerId)
        .filter((playerId): playerId is number => playerId !== null),
    );
    return candidates.filter(
      (candidate) => !awardedIds.has(candidate.playerId),
    );
  }
}

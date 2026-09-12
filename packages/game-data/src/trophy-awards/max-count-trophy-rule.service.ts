import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  count,
  DB,
  desc,
  eq,
  eras,
  matches,
  matchEvents,
  matchTeams,
  players,
  positions,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { MatchScopeFilterService } from '../shared/match-scope-filter.service';
import { TrophyRuleEventTypeFilterService } from './trophy-rule-event-type-filter.service';
import { TrophyRulePositionFilterService } from './trophy-rule-position-filter.service';
import type {
  TrophyAwardRuleRole,
  TrophyRuleEligiblePositions,
  TrophyRuleEventTypes,
  TrophyRuleWinner,
} from './trophy-rule-types';

/**
 * One `max_count` rule evaluation: which competition, which participant of a
 * matching event wins, which event types count, and how large a tie the
 * trophy tolerates. One options object rather than four positional parameters,
 * per the repo's 3-parameter ceiling.
 */
export interface MaxCountRuleOptions {
  competitionId: number;
  role: TrophyAwardRuleRole;
  types: TrophyRuleEventTypes;
  /**
   * Which positions may win at all. `undefined` for every `max_count` trophy
   * curated today — none restricts — but the dimension is carried here too
   * so a future position-restricted counting trophy needs no new mechanism.
   */
  eligiblePositionIds: TrophyRuleEligiblePositions;
  tieCutoff: number;
}

@Injectable()
export class MaxCountTrophyRuleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly eventTypeFilter: TrophyRuleEventTypeFilterService,
    private readonly positionFilter: TrophyRulePositionFilterService,
    private readonly matchScopeFilter: MatchScopeFilterService,
  ) {}

  /**
   * Every player tied for the most matching match events in the competition,
   * or none at all when the maximum is zero or more players tie than the
   * trophy's cutoff allows.
   *
   * The join graph mirrors `MatchEventCountsService.countMatchEventsByPlayer`:
   * through `match_teams` to `matches` (for the competition scope) and on to
   * `team_eras`/`eras` (which `MatchScopeFilterService` needs for its other
   * scopes). Star players are excluded for the reason that service documents —
   * each hire is its own `players` row, so no single row carries a star's real
   * record. The award's team era is the player's own, which is what a
   * `trophy_awards` row for a player must name.
   *
   * `limit` fetches one row beyond the cutoff: that extra row is exactly what
   * makes an over-cutoff tie detectable without fetching a whole competition's
   * players.
   */
  async compute(options: MaxCountRuleOptions): Promise<TrophyRuleWinner[]> {
    const { competitionId, role, types, eligiblePositionIds, tieCutoff } =
      options;
    const playerColumn =
      role === 'acting'
        ? matchEvents.actingPlayerId
        : matchEvents.consequencePlayerId;
    const matchTeamColumn =
      role === 'acting'
        ? matchEvents.actingMatchTeamId
        : matchEvents.consequenceMatchTeamId;

    const rows = await this.db
      .select({
        playerId: players.id,
        teamEraId: players.teamEraId,
        eventCount: count(matchEvents.id),
      })
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
          eq(positions.isStarPlayer, false),
          this.positionFilter.build(eligiblePositionIds),
          this.matchScopeFilter.build({ competitionId }),
        ),
      )
      .groupBy(players.id, players.teamEraId)
      .orderBy(desc(count(matchEvents.id)))
      .limit(tieCutoff + 1);

    return selectTiedWinners(rows, tieCutoff);
  }
}

/**
 * The shared max/tie decision: the top figure wins, unless it is zero or more
 * players share it than the cutoff allows.
 */
export function selectTiedWinners(
  rows: readonly { playerId: number; teamEraId: number; eventCount: number }[],
  tieCutoff: number,
): TrophyRuleWinner[] {
  const best = rows[0];
  if (best === undefined || best.eventCount < 1) {
    return [];
  }
  const winners = rows.filter((row) => row.eventCount === best.eventCount);
  if (winners.length > tieCutoff) {
    return [];
  }
  return winners.map((row) => ({
    playerId: row.playerId,
    teamEraId: row.teamEraId,
  }));
}

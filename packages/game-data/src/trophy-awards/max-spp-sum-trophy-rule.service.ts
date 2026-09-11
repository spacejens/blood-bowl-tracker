import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  desc,
  eq,
  eras,
  isNotNull,
  matches,
  matchEvents,
  matchTeams,
  not,
  players,
  positions,
  sql,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { MatchScopeFilterService } from '../shared/match-scope-filter.service';
import { selectTiedWinners } from './max-count-trophy-rule.service';
import { TrophyRuleEventTypeFilterService } from './trophy-rule-event-type-filter.service';
import type {
  TrophyAwardRuleRole,
  TrophyRuleEventTypes,
  TrophyRuleWinner,
} from './trophy-rule-types';

/**
 * One `max_spp_sum` rule evaluation. `types` empty on both sides means "every
 * event carrying SPP", which is what a real Star Player Point total is — a
 * TP-sourced event carries TP's own figure regardless of action type, so
 * restricting to the standardised SPP-earning types would undercount.
 */
export interface MaxSppSumRuleOptions {
  competitionId: number;
  role: TrophyAwardRuleRole;
  types: TrophyRuleEventTypes;
  excludedTypes: TrophyRuleEventTypes;
  tieCutoff: number;
}

@Injectable()
export class MaxSppSumTrophyRuleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly eventTypeFilter: TrophyRuleEventTypeFilterService,
    private readonly matchScopeFilter: MatchScopeFilterService,
  ) {}

  /**
   * Every player tied for the highest SPP sum in the competition, with the
   * excluded event types subtracted out, or none when the maximum is zero or
   * the tie is larger than the cutoff. Join graph, star-player exclusion,
   * team era and `limit` all match `MaxCountTrophyRuleService.compute`.
   *
   * The exclusion is wrapped in `coalesce(..., false)` before negation: a row
   * whose `action_type` is NULL makes `action_type IN (...)` evaluate to NULL,
   * and a bare `NOT NULL` is NULL too — which SQL treats as not matching, so
   * an un-coalesced negation would silently drop every consequence-only event
   * from the sum.
   */
  async compute(options: MaxSppSumRuleOptions): Promise<TrophyRuleWinner[]> {
    const { competitionId, role, types, excludedTypes, tieCutoff } = options;
    const playerColumn =
      role === 'acting'
        ? matchEvents.actingPlayerId
        : matchEvents.consequencePlayerId;
    const matchTeamColumn =
      role === 'acting'
        ? matchEvents.actingMatchTeamId
        : matchEvents.consequenceMatchTeamId;

    const excluded = this.eventTypeFilter.buildAny(excludedTypes);
    const sppSum = sql<number>`coalesce(sum(${matchEvents.sppValue}), 0)::int`;

    const rows = await this.db
      .select({
        playerId: players.id,
        teamEraId: players.teamEraId,
        eventCount: sppSum,
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
          isNotNull(matchEvents.sppValue),
          excluded === undefined
            ? undefined
            : not(sql`coalesce(${excluded}, false)`),
          eq(positions.isStarPlayer, false),
          this.matchScopeFilter.build({ competitionId }),
        ),
      )
      .groupBy(players.id, players.teamEraId)
      .orderBy(desc(sppSum))
      .limit(tieCutoff + 1);

    return selectTiedWinners(rows, tieCutoff);
  }
}

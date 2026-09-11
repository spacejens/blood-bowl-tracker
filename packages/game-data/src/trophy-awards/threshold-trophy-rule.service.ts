import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  eras,
  exists,
  gte,
  isNotNull,
  matches,
  matchEvents,
  matchTeams,
  not,
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
 * One `career_threshold` rule evaluation. Unlike the two `max_*` kinds the
 * figure is accumulated across the whole league rather than one competition:
 * the threshold is a lifetime achievement. It is nonetheless *recorded*
 * against exactly one competition — the one whose match pushed the player's
 * running total over the line — so both a league and a competition are given.
 */
export interface CareerThresholdRuleOptions {
  trophyId: number;
  /**
   * The competition this evaluation is for. A player is a winner here only if
   * this is the competition they genuinely crossed the threshold in; every
   * other competition's call returns them as no winner at all.
   */
  competitionId: number;
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
   * Every non-star player whose league-wide running figure first reached the
   * trophy's threshold in `competitionId`, and who does not already hold this
   * trophy. Zero, one, or many recipients; there is no tie cutoff, because a
   * threshold is not a competition between players.
   *
   * The crossing competition is derived from match chronology, never from the
   * order an importer happens to process competitions in: by the time this
   * step runs, every competition in the run has had all its matches imported,
   * so one league-wide, date-ordered scan answers the question identically for
   * whichever competition is asked, in whatever order.
   *
   * Two query levels, because a window function cannot be filtered in the
   * select that computes it:
   *
   * 1. `threshold_progress` walks every qualifying event of every candidate
   *    player in `(played_at, match_events.id)` order — the id tie-break makes
   *    two events in the same match deterministic — and carries a running
   *    cumulative total alongside each one, plus the competition that event's
   *    match belongs to.
   * 2. The outer `DISTINCT ON (player_id)` keeps, per player, the earliest row
   *    whose running total has reached the threshold: their true crossing
   *    event, and with it their crossing competition.
   *
   * The narrowing to `competitionId` then happens in application code, and
   * deliberately not in the outer `WHERE`: `WHERE` is applied *before*
   * `DISTINCT ON` picks a row, so a competition predicate there would select
   * the earliest crossing *within that competition* — reintroducing exactly
   * the wrong-competition attribution this shape exists to prevent. The rows
   * reaching application code are one per player who has ever crossed and is
   * not already a holder, so the filter is over a handful of rows.
   */
  async compute(
    options: CareerThresholdRuleOptions,
  ): Promise<TrophyRuleWinner[]> {
    const {
      trophyId,
      competitionId,
      leagueId,
      role,
      types,
      threshold,
      measure,
    } = options;
    const playerColumn =
      role === 'acting'
        ? matchEvents.actingPlayerId
        : matchEvents.consequencePlayerId;
    const matchTeamColumn =
      role === 'acting'
        ? matchEvents.actingMatchTeamId
        : matchEvents.consequenceMatchTeamId;

    // A player's `spp_adjustment` is Star Player Points their recorded events
    // cannot explain, with no timestamp of its own. For `spp_sum` it is
    // treated as already banked before their first match event, so a player
    // whose career total is partly adjustment crosses where their real total
    // did rather than never at all. The adjustment could in truth have landed
    // later, which would move the crossing match slightly — an accepted
    // inaccuracy, since its timing simply is not recorded anywhere. The
    // `event_count` measure counts events and has no adjustment concept.
    const bankedOffset: SQL =
      measure === 'spp_sum'
        ? sql`coalesce(${players.sppAdjustment}, 0)`
        : sql`0`;
    const eventValue: SQL =
      measure === 'spp_sum'
        ? sql`coalesce(${matchEvents.sppValue}, 0)`
        : sql`1`;
    const runningTotal = sql<number>`(${bankedOffset} + sum(${eventValue}) over (partition by ${players.id} order by ${matches.playedAt}, ${matchEvents.id} rows between unbounded preceding and current row))::int`;

    const progress = this.db
      .select({
        // `players.id` and `match_events.id` are both plain `id` columns, and
        // a subquery may not expose the same output name twice, so both are
        // given an explicit alias.
        playerId: sql<number>`${players.id}`.as('player_id'),
        teamEraId: players.teamEraId,
        competitionId: matches.competitionId,
        playedAt: matches.playedAt,
        eventId: sql<number>`${matchEvents.id}`.as('event_id'),
        runningTotal: runningTotal.as('running_total'),
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
          measure === 'spp_sum' ? isNotNull(matchEvents.sppValue) : undefined,
          eq(positions.isStarPlayer, false),
          this.matchScopeFilter.build({ leagueId }),
          // One award per player per trophy, forever. Expressed as a
          // correlated NOT EXISTS rather than a second query and a JS filter
          // so an already-decided player never enters the window computation
          // at all — this scan runs once per competition per import run, and
          // every player it can no longer award is wasted work.
          not(
            exists(
              this.db
                .select({ one: sql`1` })
                .from(trophyAwards)
                .where(
                  and(
                    eq(trophyAwards.trophyId, trophyId),
                    eq(trophyAwards.playerId, players.id),
                  ),
                ),
            ),
          ),
        ),
      )
      .as('threshold_progress');

    const crossings = await this.db
      .selectDistinctOn([progress.playerId], {
        playerId: progress.playerId,
        teamEraId: progress.teamEraId,
        competitionId: progress.competitionId,
      })
      .from(progress)
      .where(gte(progress.runningTotal, threshold))
      .orderBy(progress.playerId, progress.playedAt, progress.eventId);

    return crossings
      .filter((crossing) => crossing.competitionId === competitionId)
      .map((crossing) => ({
        playerId: crossing.playerId,
        teamEraId: crossing.teamEraId,
      }));
  }
}

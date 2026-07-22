import type { Db } from '@blood-bowl-tracker/db';
import {
  eras,
  matches,
  matchEvents,
  matchTeams,
  players,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { SQL } from 'drizzle-orm';
import { and, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';

import type { FactScope } from './fact-scope';
import type { ActionType, ConsequenceType } from './match-event-types';
import { EXPENSIVE_MISTAKE_TYPES } from './match-event-types';

/**
 * A role paired with the type set that role's filter operates over. Modelled
 * as a discriminated union (rather than independent `role` and `types`
 * parameters) so that a role/type-set mismatch — e.g. `role: 'acting'` with
 * consequence-only types — is a compile error instead of a cast-hidden bug
 * that only fails at the database.
 */
export type MatchEventSelector =
  | { role: 'acting'; types: readonly ActionType[] }
  | { role: 'consequence'; types: readonly ConsequenceType[] };

/**
 * The where clause shared by every match-event count: the type filter for the
 * given selector's role, optionally narrowed to an era and/or a competition.
 * `undefined` for either scope means "no filter", matching the public
 * `count*` signatures.
 */
function matchEventFilter(
  selector: MatchEventSelector,
  scope: FactScope,
): SQL | undefined {
  return and(
    selector.role === 'acting'
      ? inArray(matchEvents.actionType, selector.types)
      : inArray(matchEvents.consequenceType, selector.types),
    scope.eraId === undefined ? undefined : eq(teamEras.eraId, scope.eraId),
    scope.competitionId === undefined
      ? undefined
      : eq(matches.competitionId, scope.competitionId),
    scope.leagueId === undefined
      ? undefined
      : eq(eras.leagueId, scope.leagueId),
  );
}

/**
 * Options shared by every match-event count: the database handle, the
 * role/type selector, and the optional era/competition/league scope.
 */
export interface CountMatchEventsOptions {
  db: Db;
  selector: MatchEventSelector;
  eraId?: number;
  competitionId?: number;
  leagueId?: number;
  limit: number;
}

/**
 * Match events matching the given selector, counted per player and ordered
 * most-first. Ties keep the query's natural order — the caller ranks them.
 */
export async function countMatchEventsByPlayer(
  options: CountMatchEventsOptions,
): Promise<{ playerId: number; name: string; count: number }[]> {
  const { db, selector, eraId, competitionId, leagueId, limit } = options;
  return db
    .select({
      playerId: players.id,
      name: players.name,
      count: count(matchEvents.id),
    })
    .from(matchEvents)
    .innerJoin(
      players,
      eq(
        players.id,
        selector.role === 'acting'
          ? matchEvents.actingPlayerId
          : matchEvents.consequencePlayerId,
      ),
    )
    .innerJoin(
      matchTeams,
      eq(
        matchTeams.id,
        selector.role === 'acting'
          ? matchEvents.actingMatchTeamId
          : matchEvents.consequenceMatchTeamId,
      ),
    )
    .innerJoin(matches, eq(matches.id, matchTeams.matchId))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(eras, eq(eras.id, teamEras.eraId))
    .where(matchEventFilter(selector, { eraId, competitionId, leagueId }))
    .groupBy(players.id, players.name)
    .orderBy(desc(count(matchEvents.id)))
    .limit(limit);
}

/**
 * Match events matching the given selector, counted per team and ordered
 * most-first. The join graph differs from the per-player one (it
 * reaches `teams` through `teamEras` rather than joining `players`), which is
 * why the two groupings are separate functions rather than one parameterised
 * over the select shape.
 */
export async function countMatchEventsByTeam(
  options: CountMatchEventsOptions,
): Promise<{ teamId: number; name: string; count: number }[]> {
  const { db, selector, eraId, competitionId, leagueId, limit } = options;
  return db
    .select({
      teamId: teams.id,
      name: teams.name,
      count: count(matchEvents.id),
    })
    .from(matchEvents)
    .innerJoin(
      matchTeams,
      eq(
        matchTeams.id,
        selector.role === 'acting'
          ? matchEvents.actingMatchTeamId
          : matchEvents.consequenceMatchTeamId,
      ),
    )
    .innerJoin(matches, eq(matches.id, matchTeams.matchId))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(eras, eq(eras.id, teamEras.eraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .where(matchEventFilter(selector, { eraId, competitionId, leagueId }))
    .groupBy(teams.id, teams.name)
    .orderBy(desc(count(matchEvents.id)))
    .limit(limit);
}

/**
 * Options for the team-scoped, type-unfiltered per-player counter.
 */
export interface CountAllMatchEventsForTeamOptions {
  db: Db;
  teamId: number;
  limit: number;
}

/**
 * Every match event a team's players took part in as the acting player,
 * counted per player and ordered most-first, capped to `limit`. Unlike
 * `countMatchEventsByPlayer` this applies no action/consequence-type filter —
 * it totals events of every type together — and scopes to a single team via
 * the acting side's team-era. Kept as a separate function (rather than an
 * optional type filter on the shared `MatchEventSelector`) so that union's
 * role/type-set safety stays intact for the existing scoped counters.
 */
export async function countAllMatchEventsByPlayerForTeam(
  options: CountAllMatchEventsForTeamOptions,
): Promise<{ playerId: number; name: string; count: number }[]> {
  const { db, teamId, limit } = options;
  return db
    .select({
      playerId: players.id,
      name: players.name,
      count: count(matchEvents.id),
    })
    .from(matchEvents)
    .innerJoin(players, eq(players.id, matchEvents.actingPlayerId))
    .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .where(eq(teams.id, teamId))
    .groupBy(players.id, players.name)
    .orderBy(desc(count(matchEvents.id)))
    .limit(limit);
}

/** Options for the single-player, type-filtered event counter. */
export interface CountMatchEventsForPlayerOptions {
  db: Db;
  playerId: number;
  selector: MatchEventSelector;
  eraId?: number;
  competitionId?: number;
  leagueId?: number;
}

/**
 * Match events matching the selector for one specific player, returned as a
 * single total. Shares the join graph of `countMatchEventsByPlayer` but adds
 * an `eq(players.id, playerId)` filter and returns a scalar rather than a
 * per-player breakdown — the shape the player deepdive needs. Kept separate
 * from `countMatchEventsByPlayer` for the same reason
 * `countAllMatchEventsByPlayerForTeam` is: distinct result shape, not worth
 * parameterizing over.
 */
export async function countMatchEventsForPlayer(
  options: CountMatchEventsForPlayerOptions,
): Promise<number> {
  const { db, playerId, selector, eraId, competitionId, leagueId } = options;
  const [row] = await db
    .select({ count: count(matchEvents.id) })
    .from(matchEvents)
    .innerJoin(
      players,
      eq(
        players.id,
        selector.role === 'acting'
          ? matchEvents.actingPlayerId
          : matchEvents.consequencePlayerId,
      ),
    )
    .innerJoin(
      matchTeams,
      eq(
        matchTeams.id,
        selector.role === 'acting'
          ? matchEvents.actingMatchTeamId
          : matchEvents.consequenceMatchTeamId,
      ),
    )
    .innerJoin(matches, eq(matches.id, matchTeams.matchId))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(eras, eq(eras.id, teamEras.eraId))
    .where(
      and(
        matchEventFilter(selector, { eraId, competitionId, leagueId }),
        eq(players.id, playerId),
      ),
    );
  return row.count;
}

/**
 * Options shared by the two expensive-mistake queries: the database handle,
 * the optional era/competition scope, and the required SQL row cap.
 */
export interface ExpensiveMistakesOptions {
  db: Db;
  eraId?: number;
  competitionId?: number;
  leagueId?: number;
  limit: number;
}

/**
 * Money each team has lost to expensive mistakes, summed per team and ordered
 * most-first. Shares countMatchEventsByTeam's consequence-side join graph and
 * the expensive-mistake filter, but sums matchEvents.expensiveMistake
 * (coalescing the per-group total to 0) instead of counting event rows. Kept
 * separate from the count helper because the aggregate and result shape differ.
 */
export async function sumExpensiveMistakesByTeam(
  options: ExpensiveMistakesOptions,
): Promise<{ teamId: number; name: string; count: number }[]> {
  const { db, eraId, competitionId, leagueId, limit } = options;
  const selector = {
    role: 'consequence',
    types: EXPENSIVE_MISTAKE_TYPES,
  } as const;
  const total = sql<number>`coalesce(sum(${matchEvents.expensiveMistake}), 0)::int`;
  return db
    .select({ teamId: teams.id, name: teams.name, count: total })
    .from(matchEvents)
    .innerJoin(
      matchTeams,
      eq(matchTeams.id, matchEvents.consequenceMatchTeamId),
    )
    .innerJoin(matches, eq(matches.id, matchTeams.matchId))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(eras, eq(eras.id, teamEras.eraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .where(matchEventFilter(selector, { eraId, competitionId, leagueId }))
    .groupBy(teams.id, teams.name)
    .orderBy(desc(total))
    .limit(limit);
}

/**
 * Individual expensive-mistake events, one row each (no grouping), each labelled
 * with the losing team and the ISO date of the match, ordered biggest-loss
 * first. Shares countMatchEventsByTeam's consequence-side join graph plus
 * matches.playedAt; `count` carries the lost amount so each row already fits the
 * leaderboard's ranking shape, and a team may legitimately appear on several
 * rows.
 *
 * Bounded by the caller-supplied `limit` — the render layer passes a generous
 * fetch limit (see `TOPLIST_FETCH_LIMIT`) so that `topRanksWithTies` still has
 * enough rows to see a full tie group at the cutoff.
 */
export async function listBiggestExpensiveMistakes(
  options: ExpensiveMistakesOptions,
): Promise<{ teamId: number; name: string; count: number; date: string }[]> {
  const { db, eraId, competitionId, leagueId, limit } = options;
  const selector = {
    role: 'consequence',
    types: EXPENSIVE_MISTAKE_TYPES,
  } as const;
  return db
    .select({
      teamId: teams.id,
      name: teams.name,
      count: sql<number>`${matchEvents.expensiveMistake}`,
      date: sql<string>`${matches.playedAt}::date`,
    })
    .from(matchEvents)
    .innerJoin(
      matchTeams,
      eq(matchTeams.id, matchEvents.consequenceMatchTeamId),
    )
    .innerJoin(matches, eq(matches.id, matchTeams.matchId))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(eras, eq(eras.id, teamEras.eraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .where(
      and(
        matchEventFilter(selector, { eraId, competitionId, leagueId }),
        isNotNull(matchEvents.expensiveMistake),
      ),
    )
    .orderBy(desc(matchEvents.expensiveMistake))
    .limit(limit);
}

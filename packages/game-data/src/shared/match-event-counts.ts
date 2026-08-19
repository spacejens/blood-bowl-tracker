import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  eras,
  matches,
  matchEvents,
  matchTeams,
  players,
  positions,
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
 * The league/era/competition/match-category narrowing shared by every scoped
 * query over this join graph. Exported because the SPP sum in
 * `SppTotalsService` needs exactly this narrowing without any event-type
 * restriction — SPP-earning events are not one fixed type set.
 */
export function matchScopeFilter(scope: FactScope): SQL | undefined {
  return and(
    scope.leagueId === undefined
      ? undefined
      : eq(eras.leagueId, scope.leagueId),
    scope.eraId === undefined ? undefined : eq(teamEras.eraId, scope.eraId),
    scope.competitionId === undefined
      ? undefined
      : eq(matches.competitionId, scope.competitionId),
    scope.category === undefined
      ? undefined
      : eq(matches.category, scope.category),
  );
}

/**
 * The where clause shared by every match-event count: the type filter for the
 * given selector's role, optionally narrowed to a league, era, competition
 * and/or match category. `undefined` for any scope field means "no filter",
 * matching the public `count*` signatures.
 */
function matchEventFilter(
  selector: MatchEventSelector,
  scope: FactScope,
): SQL | undefined {
  return and(
    selector.role === 'acting'
      ? inArray(matchEvents.actionType, selector.types)
      : inArray(matchEvents.consequenceType, selector.types),
    matchScopeFilter(scope),
  );
}

/**
 * Options shared by every match-event count: the database handle, the
 * role/type selector, and the optional fact scope. Taking the whole
 * `FactScope` (rather than mirroring its fields one by one) keeps the callers
 * — which already hold a `FactScope` — from restating it at every call site.
 */
export interface CountMatchEventsOptions {
  db: Db;
  selector: MatchEventSelector;
  scope?: FactScope;
  limit: number;
}

/**
 * Match events matching the given selector, counted per player and ordered
 * most-first. Ties keep the query's natural order — the caller ranks them.
 *
 * Star players are excluded: a star's identity is their position and
 * each hire is its own `players` row, so a popular star would occupy several
 * slots of one global ranking — and stars, being the strongest players in the
 * game, tend to dominate these rankings outright. The filter lives here rather
 * than in the shared `matchEventFilter` because the per-team and per-coach
 * counters do not join `players` at all, and `countMatchEventsForPlayer` /
 * `countAllMatchEventsByPlayerForTeam` deliberately keep stars (see the design
 * spec's "Deliberately left unchanged").
 */
export async function countMatchEventsByPlayer(
  options: CountMatchEventsOptions,
): Promise<{ playerId: number; name: string; count: number }[]> {
  const { db, selector, scope = {}, limit } = options;
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
    .innerJoin(positions, eq(positions.id, players.positionId))
    .where(
      and(matchEventFilter(selector, scope), eq(positions.isStarPlayer, false)),
    )
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
  const { db, selector, scope = {}, limit } = options;
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
    .where(matchEventFilter(selector, scope))
    .groupBy(teams.id, teams.name)
    .orderBy(desc(count(matchEvents.id)))
    .limit(limit);
}

/**
 * Match events matching the given selector, counted per coach and ordered
 * most-first. Extends countMatchEventsByTeam's join graph by one hop —
 * `teams.coachId -> coaches.id` — so a coach's total spans every team they
 * have coached. Accepts the shared options for consistency with its siblings;
 * the coach toplists that call it simply do not pass a competition scope.
 */
export async function countMatchEventsByCoach(
  options: CountMatchEventsOptions,
): Promise<{ coachId: number; name: string; count: number }[]> {
  const { db, selector, scope = {}, limit } = options;
  return db
    .select({
      coachId: coaches.id,
      name: coaches.name,
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
    .innerJoin(coaches, eq(coaches.id, teams.coachId))
    .where(matchEventFilter(selector, scope))
    .groupBy(coaches.id, coaches.name)
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
 * One row of a team's top-players-by-match-events list. Carries the player's
 * position alongside the counts so a caller can tell a star player's hire
 * from a regular roster player without a second lookup per row — the deepdive
 * needs that to route the row's drill-down button to the star player deepdive
 * (whose id is a `positions.id`) rather than the per-team player one.
 */
export interface TeamTopPlayer {
  playerId: number;
  name: string;
  count: number;
  positionId: number;
  positionName: string;
  isStarPlayer: boolean;
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
): Promise<TeamTopPlayer[]> {
  const { db, teamId, limit } = options;
  return db
    .select({
      playerId: players.id,
      name: players.name,
      count: count(matchEvents.id),
      positionId: positions.id,
      positionName: positions.name,
      isStarPlayer: positions.isStarPlayer,
    })
    .from(matchEvents)
    .innerJoin(players, eq(players.id, matchEvents.actingPlayerId))
    .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .innerJoin(positions, eq(positions.id, players.positionId))
    .where(eq(teams.id, teamId))
    .groupBy(
      players.id,
      players.name,
      positions.id,
      positions.name,
      positions.isStarPlayer,
    )
    .orderBy(desc(count(matchEvents.id)))
    .limit(limit);
}

/** Options for the single-player, type-filtered event counter. */
export interface CountMatchEventsForPlayerOptions {
  db: Db;
  playerId: number;
  selector: MatchEventSelector;
  scope?: FactScope;
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
  const { db, playerId, selector, scope = {} } = options;
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
    .where(and(matchEventFilter(selector, scope), eq(players.id, playerId)));
  return row.count;
}

/**
 * Options shared by the two expensive-mistake queries: the database handle,
 * the optional fact scope, and the required SQL row cap.
 */
export interface ExpensiveMistakesOptions {
  db: Db;
  scope?: FactScope;
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
  const { db, scope = {}, limit } = options;
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
    .where(matchEventFilter(selector, scope))
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
): Promise<
  {
    teamId: number;
    name: string;
    count: number;
    date: string;
    category: MatchCategory;
  }[]
> {
  const { db, scope = {}, limit } = options;
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
      category: matches.category,
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
        matchEventFilter(selector, scope),
        isNotNull(matchEvents.expensiveMistake),
      ),
    )
    .orderBy(desc(matchEvents.expensiveMistake))
    .limit(limit);
}

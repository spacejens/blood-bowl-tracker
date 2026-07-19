import type { Db } from '@blood-bowl-tracker/db';
import {
  matches,
  matchEvents,
  matchTeams,
  players,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { SQL } from 'drizzle-orm';
import { and, count, desc, eq, inArray } from 'drizzle-orm';

import type { ActionType, ConsequenceType } from './match-event-types';

/**
 * Which side of a match event the counted entity was on. This co-varies
 * perfectly with the join columns — an acting-role count joins through
 * `actingPlayerId`/`actingMatchTeamId` and filters `actionType`; a
 * consequence-role count joins through `consequencePlayerId`/
 * `consequenceMatchTeamId` and filters `consequenceType` — so it is a single
 * axis rather than two.
 */
export type MatchEventRole = 'acting' | 'consequence';

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
export function matchEventFilter(
  selector: MatchEventSelector,
  eraId?: number,
  competitionId?: number,
): SQL | undefined {
  return and(
    selector.role === 'acting'
      ? inArray(matchEvents.actionType, selector.types)
      : inArray(matchEvents.consequenceType, selector.types),
    eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
    competitionId === undefined
      ? undefined
      : eq(matches.competitionId, competitionId),
  );
}

/**
 * Options shared by every match-event count: the database handle, the
 * role/type selector, and the optional era/competition scope.
 */
export interface CountMatchEventsOptions {
  db: Db;
  selector: MatchEventSelector;
  eraId?: number;
  competitionId?: number;
}

/**
 * Match events matching the given selector, counted per player and ordered
 * most-first. Ties keep the query's natural order — the caller ranks them.
 */
export async function countMatchEventsByPlayer(
  options: CountMatchEventsOptions,
): Promise<{ playerId: number; name: string; count: number }[]> {
  const { db, selector, eraId, competitionId } = options;
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
    .where(matchEventFilter(selector, eraId, competitionId))
    .groupBy(players.id, players.name)
    .orderBy(desc(count(matchEvents.id)));
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
  const { db, selector, eraId, competitionId } = options;
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
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .where(matchEventFilter(selector, eraId, competitionId))
    .groupBy(teams.id, teams.name)
    .orderBy(desc(count(matchEvents.id)));
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

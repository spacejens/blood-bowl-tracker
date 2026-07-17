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
 * The where clause shared by every match-event count: the type filter for the
 * given role, optionally narrowed to an era and/or a competition. `undefined`
 * for either scope means "no filter", matching the public `count*` signatures.
 */
export function matchEventFilter(
  role: MatchEventRole,
  types: readonly ActionType[] | readonly ConsequenceType[],
  eraId?: number,
  competitionId?: number,
): SQL | undefined {
  return and(
    role === 'acting'
      ? inArray(matchEvents.actionType, types as readonly ActionType[])
      : inArray(
          matchEvents.consequenceType,
          types as readonly ConsequenceType[],
        ),
    eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
    competitionId === undefined
      ? undefined
      : eq(matches.competitionId, competitionId),
  );
}

/**
 * Match events of the given types, in the given role, counted per player and
 * ordered most-first. Ties keep the query's natural order — the caller ranks
 * them.
 */
export async function countMatchEventsByPlayer(
  db: Db,
  role: MatchEventRole,
  types: readonly ActionType[] | readonly ConsequenceType[],
  eraId?: number,
  competitionId?: number,
): Promise<{ playerId: number; name: string; count: number }[]> {
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
        role === 'acting'
          ? matchEvents.actingPlayerId
          : matchEvents.consequencePlayerId,
      ),
    )
    .innerJoin(
      matchTeams,
      eq(
        matchTeams.id,
        role === 'acting'
          ? matchEvents.actingMatchTeamId
          : matchEvents.consequenceMatchTeamId,
      ),
    )
    .innerJoin(matches, eq(matches.id, matchTeams.matchId))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .where(matchEventFilter(role, types, eraId, competitionId))
    .groupBy(players.id, players.name)
    .orderBy(desc(count(matchEvents.id)));
}

/**
 * Match events of the given types, in the given role, counted per team and
 * ordered most-first. The join graph differs from the per-player one (it
 * reaches `teams` through `teamEras` rather than joining `players`), which is
 * why the two groupings are separate functions rather than one parameterised
 * over the select shape.
 */
export async function countMatchEventsByTeam(
  db: Db,
  role: MatchEventRole,
  types: readonly ActionType[] | readonly ConsequenceType[],
  eraId?: number,
  competitionId?: number,
): Promise<{ teamId: number; name: string; count: number }[]> {
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
        role === 'acting'
          ? matchEvents.actingMatchTeamId
          : matchEvents.consequenceMatchTeamId,
      ),
    )
    .innerJoin(matches, eq(matches.id, matchTeams.matchId))
    .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .where(matchEventFilter(role, types, eraId, competitionId))
    .groupBy(teams.id, teams.name)
    .orderBy(desc(count(matchEvents.id)));
}

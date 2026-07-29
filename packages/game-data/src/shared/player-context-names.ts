import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  eras,
  players,
  positions,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { eq, inArray } from 'drizzle-orm';

/** The position, team, race, era and coach a player belongs to, by display name. */
export interface PlayerContextNames {
  positionName: string;
  teamName: string;
  raceName: string;
  eraName: string;
  coachName: string;
}

/**
 * Context names for a batch of players, keyed by player id — the context shown
 * after a player's name in toplists and deepdive player lists. `players.position_id`,
 * `players.team_era_id`, `team_eras.team_id`, `team_eras.era_id`, `teams.race_id`
 * and `teams.coach_id` are all NOT NULL, so the inner joins can never drop a
 * requested player. An empty id list short-circuits rather than issuing an empty
 * `inArray`, which SQL would reject. Mirrors shared/team-race-coach-names.ts.
 */
export async function getPlayerContextNamesByIds(options: {
  db: Db;
  playerIds: number[];
}): Promise<Map<number, PlayerContextNames>> {
  const { db, playerIds } = options;
  if (playerIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      playerId: players.id,
      positionName: positions.name,
      teamName: teams.name,
      raceName: races.name,
      eraName: eras.name,
      coachName: coaches.name,
    })
    .from(players)
    .innerJoin(positions, eq(positions.id, players.positionId))
    .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
    .innerJoin(teams, eq(teams.id, teamEras.teamId))
    .innerJoin(races, eq(races.id, teams.raceId))
    .innerJoin(coaches, eq(coaches.id, teams.coachId))
    .innerJoin(eras, eq(eras.id, teamEras.eraId))
    .where(inArray(players.id, playerIds));
  return new Map(
    rows.map((row) => [
      row.playerId,
      {
        positionName: row.positionName,
        teamName: row.teamName,
        raceName: row.raceName,
        eraName: row.eraName,
        coachName: row.coachName,
      },
    ]),
  );
}

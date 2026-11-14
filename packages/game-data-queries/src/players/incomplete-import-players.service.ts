import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  coaches,
  count,
  DB,
  eq,
  eras,
  or,
  players,
  positions,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { INCOMPLETE_PLAYER_CRITERIA } from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

/**
 * One team-era (a team's roster in one era) with at least one player whose
 * import data is incomplete, and how many such players it has.
 */
export interface IncompleteImportTeamRow {
  teamEraId: number;
  teamId: number;
  teamName: string;
  coachId: number;
  coachName: string;
  raceName: string;
  eraName: string;
  incompletePlayerCount: number;
}

/**
 * Finds the team-eras holding players with incomplete import data, for the
 * `/debugincompleteimport` maintainer command. Ordering is left to the
 * caller, which groups and sorts by coach. What counts as incomplete is
 * game-data's shared `INCOMPLETE_PLAYER_CRITERIA`.
 */
@Injectable()
export class IncompleteImportPlayersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * One row per affected team-era, counting only players whose position is
   * not a star player. Every join is on a NOT NULL foreign key, so the inner
   * joins can never drop a matching player.
   */
  async findTeamsWithIncompletePlayers(): Promise<IncompleteImportTeamRow[]> {
    return this.db
      .select({
        teamEraId: teamEras.id,
        teamId: teams.id,
        teamName: teams.name,
        coachId: coaches.id,
        coachName: coaches.name,
        raceName: races.name,
        eraName: eras.name,
        incompletePlayerCount: count(players.id),
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(
        and(
          eq(positions.isStarPlayer, false),
          or(...INCOMPLETE_PLAYER_CRITERIA),
        ),
      )
      .groupBy(
        teamEras.id,
        teams.id,
        teams.name,
        coaches.id,
        coaches.name,
        races.name,
        eras.name,
      );
  }
}

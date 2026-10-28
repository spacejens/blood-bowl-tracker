import type { Db, SQL } from '@blood-bowl-tracker/db';
import {
  and,
  coaches,
  count,
  DB,
  eq,
  eras,
  isNull,
  or,
  players,
  positions,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
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
 * What makes a player's imported data incomplete; a player matching ANY entry
 * counts. A zero `move`/`strength`/`agility`/`armour` is the column default,
 * legal under no rules set, so it marks an import that never supplied the
 * real value. A NULL `spp_total`/`spp_adjustment`/`status` means no source
 * populated it. `passing` is deliberately absent: NULL and 0 are both
 * legitimate there. A new kind of gap is a one-line addition here.
 *
 * Star players are never counted, whatever these columns hold. That exclusion
 * is applied in the query, not in this list, because it narrows which players
 * are looked at rather than describing a kind of gap.
 */
const INCOMPLETE_PLAYER_CRITERIA: readonly SQL[] = [
  eq(players.move, 0),
  eq(players.strength, 0),
  eq(players.agility, 0),
  eq(players.armour, 0),
  isNull(players.sppTotal),
  isNull(players.sppAdjustment),
  isNull(players.status),
];

/**
 * Finds the team-eras holding players with incomplete import data, for the
 * `/debugincompleteimport` maintainer command. Ordering is left to the
 * caller, which groups and sorts by coach.
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

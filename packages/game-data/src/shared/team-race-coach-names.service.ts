import type { Db } from '@blood-bowl-tracker/db';
import { coaches, DB, races, teams } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

/** The race and coach a team belongs to, by display name. */
export interface TeamRaceAndCoachNames {
  raceName: string;
  coachName: string;
}

@Injectable()
export class TeamRaceCoachNamesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Race and coach names for a batch of teams, keyed by team id — the context
   * shown after a team's name in toplists and deepdive team lists.
   * `teams.race_id` and `teams.coach_id` are both NOT NULL, so the inner joins
   * can never drop a requested team. An empty id list short-circuits rather
   * than issuing an empty `inArray`, which SQL would reject.
   */
  async getRaceAndCoachNamesByIds(
    teamIds: number[],
  ): Promise<Map<number, TeamRaceAndCoachNames>> {
    if (teamIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        teamId: teams.id,
        raceName: races.name,
        coachName: coaches.name,
      })
      .from(teams)
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(inArray(teams.id, teamIds));
    return new Map(
      rows.map((row) => [
        row.teamId,
        { raceName: row.raceName, coachName: row.coachName },
      ]),
    );
  }
}

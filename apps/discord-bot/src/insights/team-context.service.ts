import { TeamsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/** Which pieces of team context a list wants appended to each team name. */
export interface TeamContextOptions {
  includeRace: boolean;
  includeCoach: boolean;
}

/**
 * Annotates rows that name a team with the team's race and/or coach, so a
 * reader can identify a team they do not know by name. A list already scoped to
 * one race or one coach leaves that redundant half out (see the deepdive call
 * sites).
 *
 * One batched lookup covers the whole row set. A team the lookup has no entry
 * for gets an empty suffix rather than a partial one — `teams.race_id` and
 * `teams.coach_id` are NOT NULL so this should not happen, but keeping the
 * mapping total avoids rendering `undefined` into a Discord embed.
 */
@Injectable()
export class TeamContextService {
  constructor(private readonly teams: TeamsService) {}

  async attachSuffixes<T>(
    rows: T[],
    teamIdOf: (row: T) => number,
    options: TeamContextOptions,
  ): Promise<(T & { contextSuffix: string })[]> {
    if (rows.length === 0) {
      return [];
    }
    const names = await this.teams.getRaceAndCoachNamesByIds(
      rows.map(teamIdOf),
    );
    return rows.map((row) => {
      const entry = names.get(teamIdOf(row));
      const parts =
        entry === undefined
          ? []
          : [
              ...(options.includeRace ? [entry.raceName] : []),
              ...(options.includeCoach ? [entry.coachName] : []),
            ];
      return {
        ...row,
        contextSuffix: parts.length === 0 ? '' : ` (${parts.join(', ')})`,
      };
    });
  }
}

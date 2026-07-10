import type { Team } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import { teamExternalIds, teams } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

export class TeamUpsertConflictError extends Error {}

export interface UpsertTeamData {
  name: string;
  raceId: number;
  coachId: number;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class TeamsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertTeamData,
  ): Promise<{ team: Team; created: boolean }> {
    const existingRows = await this.db
      .select({
        teamId: teamExternalIds.teamId,
        externalSystemId: teamExternalIds.externalSystemId,
        externalId: teamExternalIds.externalId,
      })
      .from(teamExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(teamExternalIds.externalSystemId, e.externalSystemId),
              eq(teamExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctTeamIds = [...new Set(existingRows.map((r) => r.teamId))];

    if (distinctTeamIds.length > 1) {
      throw new TeamUpsertConflictError(
        `External IDs matched multiple existing teams: ${distinctTeamIds.join(', ')}`,
      );
    }

    const values = {
      name: data.name,
      raceId: data.raceId,
      coachId: data.coachId,
    };

    let team: Team;
    const created = distinctTeamIds.length === 0;

    if (created) {
      const result = await this.db.insert(teams).values(values).returning();
      team = result[0];
    } else {
      const result = await this.db
        .update(teams)
        .set(values)
        .where(eq(teams.id, distinctTeamIds[0]))
        .returning();
      team = result[0];
    }

    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = data.externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(teamExternalIds).values(
        newExternalIds.map((e) => ({
          teamId: team.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }

    return { team, created };
  }
}

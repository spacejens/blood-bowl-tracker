import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import { leagues, leagueExternalIds } from '@blood-bowl-tracker/db';
import type { League } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';

export class LeagueUpsertConflictError extends Error {}

export interface UpsertLeagueData {
  name: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class LeaguesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertLeagueData,
  ): Promise<{ league: League; created: boolean }> {
    const existingRows = await this.db
      .select({
        leagueId: leagueExternalIds.leagueId,
        externalSystemId: leagueExternalIds.externalSystemId,
        externalId: leagueExternalIds.externalId,
      })
      .from(leagueExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(leagueExternalIds.externalSystemId, e.externalSystemId),
              eq(leagueExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctLeagueIds = [...new Set(existingRows.map((r) => r.leagueId))];

    if (distinctLeagueIds.length > 1) {
      throw new LeagueUpsertConflictError(
        `External IDs matched multiple existing leagues: ${distinctLeagueIds.join(', ')}`,
      );
    }

    let league: League;
    const created = distinctLeagueIds.length === 0;

    if (created) {
      const result = await this.db
        .insert(leagues)
        .values({ name: data.name })
        .returning();
      league = result[0];
    } else {
      const result = await this.db
        .update(leagues)
        .set({ name: data.name })
        .where(eq(leagues.id, distinctLeagueIds[0]))
        .returning();
      league = result[0];
    }

    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = data.externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(leagueExternalIds).values(
        newExternalIds.map((e) => ({
          leagueId: league.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }

    return { league, created };
  }
}

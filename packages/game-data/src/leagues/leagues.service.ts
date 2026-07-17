import type { League } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import { leagueExternalIds, leagues } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

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
    const { ownerIds, existingRows } = await resolveExistingByExternalIds(
      this.db,
      leagueExternalIds,
      leagueExternalIds.leagueId,
      leagueExternalIds.externalSystemId,
      leagueExternalIds.externalId,
      data.externalIds,
    );

    if (ownerIds.length > 1) {
      throw new LeagueUpsertConflictError(
        `External IDs matched multiple existing leagues: ${ownerIds.join(', ')}`,
      );
    }

    let league: League;
    const created = ownerIds.length === 0;

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
        .where(eq(leagues.id, ownerIds[0]))
        .returning();
      league = result[0];
    }

    await insertMissingExternalIds(
      this.db,
      leagueExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ leagueId: league.id, ...pair }),
    );

    return { league, created };
  }

  countAll(): Promise<number> {
    return countRows(this.db, leagues);
  }
}

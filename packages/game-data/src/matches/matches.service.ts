import type { Db, Match } from '@blood-bowl-tracker/db';
import { DB, matches, matchEvents, matchExternalIds } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

export class MatchUpsertConflictError extends Error {}

export interface UpsertMatchData {
  competitionId: number;
  playedAt: Date;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class MatchesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertMatchData,
  ): Promise<{ match: Match; created: boolean }> {
    const existingRows = await this.db
      .select({
        matchId: matchExternalIds.matchId,
        externalSystemId: matchExternalIds.externalSystemId,
        externalId: matchExternalIds.externalId,
      })
      .from(matchExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(matchExternalIds.externalSystemId, e.externalSystemId),
              eq(matchExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctMatchIds = [...new Set(existingRows.map((r) => r.matchId))];

    if (distinctMatchIds.length > 1) {
      throw new MatchUpsertConflictError(
        `External IDs matched multiple existing matches: ${distinctMatchIds.join(', ')}`,
      );
    }

    const values = {
      competitionId: data.competitionId,
      playedAt: data.playedAt,
    };

    let match: Match;
    const created = distinctMatchIds.length === 0;

    if (created) {
      const result = await this.db.insert(matches).values(values).returning();
      match = result[0];
    } else {
      const result = await this.db
        .update(matches)
        .set(values)
        .where(eq(matches.id, distinctMatchIds[0]))
        .returning();
      match = result[0];
    }

    await this.syncExternalIds(match.id, data.externalIds, existingRows);

    return { match, created };
  }

  private async syncExternalIds(
    matchId: number,
    externalIds: { externalSystemId: number; externalId: string }[],
    existingRows: { externalSystemId: number; externalId: string }[],
  ): Promise<void> {
    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(matchExternalIds).values(
        newExternalIds.map((e) => ({
          matchId,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }
  }

  countAll(): Promise<number> {
    return countRows(this.db, matches);
  }

  countMatchEvents(): Promise<number> {
    return countRows(this.db, matchEvents);
  }
}

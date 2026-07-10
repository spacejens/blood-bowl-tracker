import type { Db, Era } from '@blood-bowl-tracker/db';
import { DB, eraExternalIds, eras } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

export class EraUpsertConflictError extends Error {}

export interface UpsertEraData {
  name: string;
  leagueId: number;
  rulesSetId: number;
  startDate: string;
  endDate?: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class ErasService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(data: UpsertEraData): Promise<{ era: Era; created: boolean }> {
    const existingRows = await this.db
      .select({
        eraId: eraExternalIds.eraId,
        externalSystemId: eraExternalIds.externalSystemId,
        externalId: eraExternalIds.externalId,
      })
      .from(eraExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(eraExternalIds.externalSystemId, e.externalSystemId),
              eq(eraExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctEraIds = [...new Set(existingRows.map((r) => r.eraId))];

    if (distinctEraIds.length > 1) {
      throw new EraUpsertConflictError(
        `External IDs matched multiple existing eras: ${distinctEraIds.join(', ')}`,
      );
    }

    const values = {
      name: data.name,
      leagueId: data.leagueId,
      rulesSetId: data.rulesSetId,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
    };

    let era: Era;
    const created = distinctEraIds.length === 0;

    if (created) {
      const result = await this.db.insert(eras).values(values).returning();
      era = result[0];
    } else {
      const result = await this.db
        .update(eras)
        .set(values)
        .where(eq(eras.id, distinctEraIds[0]))
        .returning();
      era = result[0];
    }

    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = data.externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(eraExternalIds).values(
        newExternalIds.map((e) => ({
          eraId: era.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }

    return { era, created };
  }
}

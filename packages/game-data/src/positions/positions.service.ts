import type { Db, Position } from '@blood-bowl-tracker/db';
import { DB, positionExternalIds, positions } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

export class PositionUpsertConflictError extends Error {}

export interface UpsertPositionData {
  name: string;
  raceId: number;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class PositionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertPositionData,
  ): Promise<{ position: Position; created: boolean }> {
    const existingRows = await this.db
      .select({
        positionId: positionExternalIds.positionId,
        externalSystemId: positionExternalIds.externalSystemId,
        externalId: positionExternalIds.externalId,
      })
      .from(positionExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(positionExternalIds.externalSystemId, e.externalSystemId),
              eq(positionExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctPositionIds = [
      ...new Set(existingRows.map((r) => r.positionId)),
    ];

    if (distinctPositionIds.length > 1) {
      throw new PositionUpsertConflictError(
        `External IDs matched multiple existing positions: ${distinctPositionIds.join(', ')}`,
      );
    }

    const values = { name: data.name, raceId: data.raceId };

    let position: Position;
    const created = distinctPositionIds.length === 0;

    if (created) {
      const result = await this.db.insert(positions).values(values).returning();
      position = result[0];
    } else {
      const result = await this.db
        .update(positions)
        .set(values)
        .where(eq(positions.id, distinctPositionIds[0]))
        .returning();
      position = result[0];
    }

    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = data.externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(positionExternalIds).values(
        newExternalIds.map((e) => ({
          positionId: position.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }

    return { position, created };
  }
}

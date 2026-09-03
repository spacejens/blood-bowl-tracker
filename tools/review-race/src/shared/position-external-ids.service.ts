import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  externalSystems,
  positionExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

/** One external id a position carries. */
export interface PositionExternalIdRow {
  systemName: string;
  externalId: string;
}

/**
 * Every external id for a batch of positions, in one query. Batched rather
 * than per-position because a race has up to a couple of dozen positions and
 * both the availability and characteristics panels need their ids.
 */
@Injectable()
export class PositionExternalIdsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async forPositions(
    positionIds: number[],
  ): Promise<Map<number, PositionExternalIdRow[]>> {
    const byPosition = new Map<number, PositionExternalIdRow[]>();
    if (positionIds.length === 0) {
      return byPosition;
    }
    const rows = await this.db
      .select({
        positionId: positionExternalIds.positionId,
        systemName: externalSystems.name,
        externalId: positionExternalIds.externalId,
      })
      .from(positionExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, positionExternalIds.externalSystemId),
      )
      .where(inArray(positionExternalIds.positionId, positionIds))
      .orderBy(asc(externalSystems.name), asc(positionExternalIds.externalId));
    for (const row of rows) {
      const existing = byPosition.get(row.positionId) ?? [];
      existing.push({
        systemName: row.systemName,
        externalId: row.externalId,
      });
      byPosition.set(row.positionId, existing);
    }
    return byPosition;
  }
}

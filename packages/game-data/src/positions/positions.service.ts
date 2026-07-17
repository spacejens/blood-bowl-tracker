import type { Db, Position } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  positionExternalIds,
  positions,
  positionsRaceEras,
  raceEras,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, countDistinct, eq, inArray, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

export class PositionUpsertConflictError extends Error {}

export interface UpsertPositionData {
  name: string;
  isStarPlayer: boolean;
  externalIds: { externalSystemId: number; externalId: string }[];
}

export interface SyncPositionRaceErasData {
  positionId: number;
  raceEras: { raceId: number; eraId: number }[];
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

    const values = { name: data.name, isStarPlayer: data.isStarPlayer };

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

    await insertMissingExternalIds(
      this.db,
      positionExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ positionId: position.id, ...pair }),
    );

    return { position, created };
  }

  /**
   * Upsert-only: inserts any of `data.raceEras` not already present, but
   * never removes a previously persisted row. Availability evidence
   * accumulates and is never revoked by a later sync.
   */
  async syncRaceEras(
    data: SyncPositionRaceErasData,
  ): Promise<{ positionId: number; raceEraIds: number[] }> {
    if (data.raceEras.length === 0) {
      return { positionId: data.positionId, raceEraIds: [] };
    }

    const raceIds = [...new Set(data.raceEras.map((re) => re.raceId))];
    const raceEraRows = await this.db
      .select({
        id: raceEras.id,
        raceId: raceEras.raceId,
        eraId: raceEras.eraId,
      })
      .from(raceEras)
      .where(inArray(raceEras.raceId, raceIds));

    const idByKey = new Map(
      raceEraRows.map((r) => [`${r.raceId}:${r.eraId}`, r.id]),
    );

    const resolvedIds: number[] = [];
    for (const re of data.raceEras) {
      const id = idByKey.get(`${re.raceId}:${re.eraId}`);
      if (id !== undefined) {
        resolvedIds.push(id);
      }
    }
    const raceEraIds = [...new Set(resolvedIds)];

    if (raceEraIds.length > 0) {
      const existing = await this.db
        .select({ raceEraId: positionsRaceEras.raceEraId })
        .from(positionsRaceEras)
        .where(eq(positionsRaceEras.positionId, data.positionId));
      const existingIds = new Set(existing.map((r) => r.raceEraId));
      const toInsert = raceEraIds.filter((id) => !existingIds.has(id));
      if (toInsert.length > 0) {
        await this.db.insert(positionsRaceEras).values(
          toInsert.map((raceEraId) => ({
            positionId: data.positionId,
            raceEraId,
          })),
        );
      }
    }

    return { positionId: data.positionId, raceEraIds };
  }

  countAll(): Promise<number> {
    return countRows(this.db, positions);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaceEras.positionId) })
      .from(positionsRaceEras)
      .innerJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .where(eq(raceEras.eraId, eraId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaceEras.positionId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(
        raceEras,
        and(
          eq(raceEras.raceId, teams.raceId),
          eq(raceEras.eraId, teamEras.eraId),
        ),
      )
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.raceEraId, raceEras.id),
      )
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}

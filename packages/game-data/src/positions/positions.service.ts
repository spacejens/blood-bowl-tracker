import type { Db, Position } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  positionExternalIds,
  positions,
  positionsRaces,
  raceEras,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, countDistinct, eq, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

export class PositionUpsertConflictError extends Error {}

export interface UpsertPositionData {
  name: string;
  isStarPlayer: boolean;
  races: { raceId: number; isDeleted: boolean }[];
  externalIds: { externalSystemId: number; externalId: string }[];
}

export interface PositionWithRaces extends Position {
  races: { raceId: number; isDeleted: boolean }[];
}

@Injectable()
export class PositionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertPositionData,
  ): Promise<{ position: PositionWithRaces; created: boolean }> {
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

    await this.syncRaces(position.id, data.races);
    await this.syncExternalIds(position.id, data.externalIds, existingRows);

    return { position: { ...position, races: data.races }, created };
  }

  private async syncRaces(
    positionId: number,
    races: { raceId: number; isDeleted: boolean }[],
  ): Promise<void> {
    const existing = await this.db
      .select({
        raceId: positionsRaces.raceId,
        isDeleted: positionsRaces.isDeleted,
      })
      .from(positionsRaces)
      .where(eq(positionsRaces.positionId, positionId));

    const existingByRaceId = new Map(
      existing.map((r) => [r.raceId, r.isDeleted]),
    );

    const toInsert = races.filter((r) => !existingByRaceId.has(r.raceId));
    if (toInsert.length > 0) {
      await this.db.insert(positionsRaces).values(
        toInsert.map((r) => ({
          positionId,
          raceId: r.raceId,
          isDeleted: r.isDeleted,
        })),
      );
    }

    for (const r of races) {
      const current = existingByRaceId.get(r.raceId);
      if (current !== undefined && current !== r.isDeleted) {
        await this.db
          .update(positionsRaces)
          .set({ isDeleted: r.isDeleted })
          .where(
            and(
              eq(positionsRaces.positionId, positionId),
              eq(positionsRaces.raceId, r.raceId),
            ),
          );
      }
    }
  }

  private async syncExternalIds(
    positionId: number,
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
      await this.db.insert(positionExternalIds).values(
        newExternalIds.map((e) => ({
          positionId,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }
  }

  countAll(): Promise<number> {
    return countRows(this.db, positions);
  }

  /**
   * Approximation: positions have no direct era relationship, so this counts
   * every position of any race available in the era via positions_races ->
   * race_eras. A position may not have existed for its race in every era the
   * race spans. See issue #153 for a proper position-race-era model.
   */
  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaces.positionId) })
      .from(positionsRaces)
      .innerJoin(raceEras, eq(raceEras.raceId, positionsRaces.raceId))
      .where(eq(raceEras.eraId, eraId));
    return row.count;
  }

  /**
   * Approximation: mirrors countByEra — counts every position of any race
   * played by a team in the competition, without accounting for whether the
   * position existed for that race at the time. See issue #153.
   */
  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaces.positionId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(positionsRaces, eq(positionsRaces.raceId, teams.raceId))
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}

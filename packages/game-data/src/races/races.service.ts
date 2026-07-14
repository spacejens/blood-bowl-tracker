import type { Race } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import { raceEras, raceExternalIds, races } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

export class RaceUpsertConflictError extends Error {}

export interface UpsertRaceData {
  name: string;
  eras?: number[];
  externalIds: { externalSystemId: number; externalId: string }[];
}

export interface RaceWithEras extends Race {
  eras: number[];
}

@Injectable()
export class RacesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertRaceData,
  ): Promise<{ race: RaceWithEras; created: boolean }> {
    const existingRows = await this.db
      .select({
        raceId: raceExternalIds.raceId,
        externalSystemId: raceExternalIds.externalSystemId,
        externalId: raceExternalIds.externalId,
      })
      .from(raceExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(raceExternalIds.externalSystemId, e.externalSystemId),
              eq(raceExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctRaceIds = [...new Set(existingRows.map((r) => r.raceId))];

    if (distinctRaceIds.length > 1) {
      throw new RaceUpsertConflictError(
        `External IDs matched multiple existing races: ${distinctRaceIds.join(', ')}`,
      );
    }

    let race: Race;
    const created = distinctRaceIds.length === 0;

    if (created) {
      const result = await this.db
        .insert(races)
        .values({ name: data.name })
        .returning();
      race = result[0];
    } else {
      const result = await this.db
        .update(races)
        .set({ name: data.name })
        .where(eq(races.id, distinctRaceIds[0]))
        .returning();
      race = result[0];
    }

    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = data.externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(raceExternalIds).values(
        newExternalIds.map((e) => ({
          raceId: race.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }

    const eras = await this.syncEras(race.id, data.eras ?? []);
    return { race: { ...race, eras }, created };
  }

  private async syncEras(raceId: number, eraIds: number[]): Promise<number[]> {
    const existing = await this.db
      .select({ eraId: raceEras.eraId })
      .from(raceEras)
      .where(eq(raceEras.raceId, raceId));

    const existingIds = existing.map((r) => r.eraId);
    const existingSet = new Set(existingIds);
    const toInsert = eraIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await this.db
        .insert(raceEras)
        .values(toInsert.map((eraId) => ({ raceId, eraId })));
    }

    return [...existingIds, ...toInsert];
  }

  countAll(): Promise<number> {
    return countRows(this.db, races);
  }
}

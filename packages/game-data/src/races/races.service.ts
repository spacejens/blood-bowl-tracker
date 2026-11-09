import type {
  ExternalId,
  ResolveResult,
  UpsertRace,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Race } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  eras,
  isNull,
  raceEras,
  raceExternalIds,
  races,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class RaceUpsertConflictError extends UpsertConflictError {}

export interface RaceWithEras extends Race {
  eras: number[];
}

@Injectable()
export class RacesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * The eras this race can be played in that are still ongoing (no end
   * date), oldest first. A race belongs to Dungeon Bowl or to normal play,
   * never both, so more than one result means the race is genuinely
   * ambiguous across two overlapping eras of the same kind — a caller
   * needing exactly one decides what to do about that.
   */
  listOngoingEras(raceId: number): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: eras.id, name: eras.name })
      .from(raceEras)
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(and(eq(raceEras.raceId, raceId), isNull(eras.endDate)))
      .orderBy(eras.startDate, eras.name);
  }

  async upsert(
    data: UpsertRace,
  ): Promise<{ race: RaceWithEras; created: boolean }> {
    const { row: race, created } = await upsertByExternalIds<
      typeof races,
      typeof raceExternalIds
    >({
      db: this.db,
      entityTable: races,
      entityIdColumn: races.id,
      // A race's name is curated by tools/import-manual once the row exists;
      // only an upsert that says so may overwrite it.
      values: data.renameExisting === true ? { name: data.name } : {},
      createOnlyValues: { name: data.name },
      externalIdTable: raceExternalIds,
      ownerIdColumn: raceExternalIds.raceId,
      externalSystemIdColumn: raceExternalIds.externalSystemId,
      externalIdColumn: raceExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: RaceUpsertConflictError,
      entityLabelPlural: 'races',
      buildExternalIdRow: (raceId, externalId) => ({ raceId, ...externalId }),
    });

    const eras = await this.syncEras(race.id, data.eras);
    return { race: { ...race, eras }, created };
  }

  /**
   * Resolve one external-id pair to the race that already declares it. The
   * read-only half of what `upsert` does internally, exposed on its own so a
   * caller can reference a race imported in an earlier run, phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: raceExternalIds,
      ownerIdColumn: raceExternalIds.raceId,
      externalSystemIdColumn: raceExternalIds.externalSystemId,
      externalIdColumn: raceExternalIds.externalId,
      externalIds,
    });
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
}

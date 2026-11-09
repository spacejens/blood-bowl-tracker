import type {
  ExternalId,
  ResolveResult,
  SyncPositionRaceEras,
  SyncPositionRaceErasResult,
  UpsertPosition,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Position } from '@blood-bowl-tracker/db';
import {
  DB,
  eq,
  inArray,
  positionExternalIds,
  positions,
  positionsRaceEras,
  raceEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { PositionValidationError } from '../shared/position-validation-error';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class PositionUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class PositionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertPosition,
  ): Promise<{ position: Position; created: boolean }> {
    const { row: position, created } = await upsertByExternalIds<
      typeof positions,
      typeof positionExternalIds
    >({
      db: this.db,
      entityTable: positions,
      entityIdColumn: positions.id,
      values: {
        // A position's display name is curated by tools/import-manual once
        // the row exists; only an upsert that says so may overwrite it.
        ...(data.renameExisting === true ? { name: data.name } : {}),
        isStarPlayer: data.isStarPlayer,
      },
      createOnlyValues: { name: data.name },
      externalIdTable: positionExternalIds,
      ownerIdColumn: positionExternalIds.positionId,
      externalSystemIdColumn: positionExternalIds.externalSystemId,
      externalIdColumn: positionExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: PositionUpsertConflictError,
      entityLabelPlural: 'positions',
      buildExternalIdRow: (positionId, externalId) => ({
        positionId,
        ...externalId,
      }),
      // A star position's external id can happen to collide with an
      // already-upserted *regular* position's id (or vice versa): both are
      // "one matched owner" as far as the external-id lookup is concerned,
      // but applying the update would silently turn one kind of position
      // into the other. Reject that as a conflict instead of applying it.
      detectSemanticConflict: (existingRow, values) =>
        values.isStarPlayer !== undefined &&
        existingRow.isStarPlayer !== values.isStarPlayer,
    });

    return { position, created };
  }

  /**
   * Resolve one external-id pair to the position that already declares it.
   * The read-only half of what `upsert` does internally, exposed on its own
   * so a caller can reference a position imported in an earlier run, phase
   * or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: positionExternalIds,
      ownerIdColumn: positionExternalIds.positionId,
      externalSystemIdColumn: positionExternalIds.externalSystemId,
      externalIdColumn: positionExternalIds.externalId,
      externalIds,
    });
  }

  /**
   * Upsert-only: inserts any of `data.raceEras` not already present, but
   * never removes a previously persisted row. Availability evidence
   * accumulates and is never revoked by a later sync.
   *
   * The whole batch is validated before any write: a position that does not
   * exist, or a (raceId, eraId) pair with no `race_eras` row (the race is not
   * recorded as playable in that era), rejects the call with a
   * PositionValidationError naming it, rather than dropping the pair. A pair
   * repeated within the batch is not an error: the call is a set union, so
   * the repeat collapses onto one link. A call with no race/era pairs is a
   * no-op that does not check the position.
   */
  async syncRaceEras(
    data: SyncPositionRaceEras,
  ): Promise<SyncPositionRaceErasResult> {
    if (data.raceEras.length === 0) {
      return { positionId: data.positionId, raceEraIds: [] };
    }

    const positionRows = await this.db
      .select({ id: positions.id })
      .from(positions)
      .where(eq(positions.id, data.positionId));
    if (positionRows.length === 0) {
      throw new PositionValidationError(
        `Position ${data.positionId} does not exist, so no race/era availability can be recorded for it`,
      );
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
      if (id === undefined) {
        throw new PositionValidationError(
          `Race ${re.raceId} is not available in era ${re.eraId} (no race_eras row), so position ${data.positionId} cannot be made available there`,
        );
      }
      resolvedIds.push(id);
    }
    const raceEraIds = [...new Set(resolvedIds)];

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

    return { positionId: data.positionId, raceEraIds };
  }
}

import type {
  ExternalId,
  ResolveResult,
  UpsertCoach,
} from '@blood-bowl-tracker/api-contract';
import type { Coach, Db } from '@blood-bowl-tracker/db';
import { coaches, coachExternalIds, DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class CoachUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class CoachesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(data: UpsertCoach): Promise<{ coach: Coach; created: boolean }> {
    const { row: coach, created } = await upsertByExternalIds<
      typeof coaches,
      typeof coachExternalIds
    >({
      db: this.db,
      entityTable: coaches,
      entityIdColumn: coaches.id,
      // A coach's name is curated by tools/import-manual once the row exists;
      // only an upsert that says so may overwrite it.
      values: data.renameExisting === true ? { name: data.name } : {},
      createOnlyValues: { name: data.name },
      externalIdTable: coachExternalIds,
      ownerIdColumn: coachExternalIds.coachId,
      externalSystemIdColumn: coachExternalIds.externalSystemId,
      externalIdColumn: coachExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: CoachUpsertConflictError,
      entityLabelPlural: 'coaches',
      buildExternalIdRow: (coachId, externalId) => ({ coachId, ...externalId }),
    });

    return { coach, created };
  }

  /**
   * Resolve one external-id pair to the coach that already declares it. The
   * read-only half of what `upsert` does internally, exposed on its own so a
   * caller can reference a coach imported in an earlier run, phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: coachExternalIds,
      ownerIdColumn: coachExternalIds.coachId,
      externalSystemIdColumn: coachExternalIds.externalSystemId,
      externalIdColumn: coachExternalIds.externalId,
      externalIds,
    });
  }
}

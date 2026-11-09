import type {
  ExternalId,
  ResolveResult,
  UpsertEra,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Era } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  eraExternalIds,
  eraRulesSets,
  eras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class EraUpsertConflictError extends UpsertConflictError {}

export interface EraWithRulesSets extends Era {
  rulesSetIds: number[];
}

@Injectable()
export class ErasService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertEra,
  ): Promise<{ era: EraWithRulesSets; created: boolean }> {
    const { row: era, created } = await upsertByExternalIds<
      typeof eras,
      typeof eraExternalIds
    >({
      db: this.db,
      entityTable: eras,
      entityIdColumn: eras.id,
      values: {
        name: data.name,
        leagueId: data.leagueId,
        startDate: data.startDate,
        endDate: data.endDate,
      },
      externalIdTable: eraExternalIds,
      ownerIdColumn: eraExternalIds.eraId,
      externalSystemIdColumn: eraExternalIds.externalSystemId,
      externalIdColumn: eraExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: EraUpsertConflictError,
      entityLabelPlural: 'eras',
      buildExternalIdRow: (eraId, externalId) => ({ eraId, ...externalId }),
    });

    const rulesSetIds = await this.syncRulesSets(era.id, data.rulesSetIds);
    return { era: { ...era, rulesSetIds }, created };
  }

  /**
   * Resolve one external-id pair to the era that already declares it. The
   * read-only half of what `upsert` does internally, exposed on its own so a
   * caller can reference an era imported in an earlier run, phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: eraExternalIds,
      ownerIdColumn: eraExternalIds.eraId,
      externalSystemIdColumn: eraExternalIds.externalSystemId,
      externalIdColumn: eraExternalIds.externalId,
      externalIds,
    });
  }

  private async syncRulesSets(
    eraId: number,
    rulesSetIds: number[],
  ): Promise<number[]> {
    const existing = await this.db
      .select({ rulesSetId: eraRulesSets.rulesSetId })
      .from(eraRulesSets)
      .where(eq(eraRulesSets.eraId, eraId));

    const existingIds = existing.map((r) => r.rulesSetId);
    const existingSet = new Set(existingIds);
    const toInsert = rulesSetIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await this.db
        .insert(eraRulesSets)
        .values(toInsert.map((rulesSetId) => ({ eraId, rulesSetId })));
    }

    return [...existingIds, ...toInsert];
  }

  /**
   * Every era that declares this rules set and carries an external id under
   * this external system, distinct, oldest id first. Scoping by external
   * system is what keeps an importer to its own league's eras: another
   * source's league can declare the same rules set, but its eras carry no id
   * under this system. `id` is selected because Postgres requires SELECT
   * DISTINCT's ORDER BY expressions to appear in the select list.
   */
  listByRulesSetAndExternalSystem(options: {
    rulesSetId: number;
    externalSystemId: number;
  }): Promise<{ id: number; name: string }[]> {
    const { rulesSetId, externalSystemId } = options;
    return this.db
      .selectDistinct({ id: eras.id, name: eras.name })
      .from(eraRulesSets)
      .innerJoin(eras, eq(eras.id, eraRulesSets.eraId))
      .innerJoin(eraExternalIds, eq(eraExternalIds.eraId, eras.id))
      .where(
        and(
          eq(eraRulesSets.rulesSetId, rulesSetId),
          eq(eraExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .orderBy(eras.id);
  }
}

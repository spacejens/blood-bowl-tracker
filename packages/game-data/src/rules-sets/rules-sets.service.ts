import type {
  ExternalId,
  ResolveResult,
  UpsertRulesSet,
} from '@blood-bowl-tracker/api-contract';
import type { Db, RulesSet } from '@blood-bowl-tracker/db';
import { DB, rulesSetExternalIds, rulesSets } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class RulesSetUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class RulesSetsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertRulesSet,
  ): Promise<{ rulesSet: RulesSet; created: boolean }> {
    const { row: rulesSet, created } = await upsertByExternalIds<
      typeof rulesSets,
      typeof rulesSetExternalIds
    >({
      db: this.db,
      entityTable: rulesSets,
      entityIdColumn: rulesSets.id,
      values: { name: data.name },
      externalIdTable: rulesSetExternalIds,
      ownerIdColumn: rulesSetExternalIds.rulesSetId,
      externalSystemIdColumn: rulesSetExternalIds.externalSystemId,
      externalIdColumn: rulesSetExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: RulesSetUpsertConflictError,
      entityLabelPlural: 'rules sets',
      buildExternalIdRow: (rulesSetId, pair) => ({ rulesSetId, ...pair }),
    });

    return { rulesSet, created };
  }

  /**
   * Resolve one external-id pair to the rules set that already declares it.
   * The read-only half of what `upsert` does internally, exposed on its own
   * so a caller can reference a rules set imported in an earlier run, phase
   * or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: rulesSetExternalIds,
      ownerIdColumn: rulesSetExternalIds.rulesSetId,
      externalSystemIdColumn: rulesSetExternalIds.externalSystemId,
      externalIdColumn: rulesSetExternalIds.externalId,
      externalIds,
    });
  }

  countAll(): Promise<number> {
    return countRows(this.db, rulesSets);
  }
}

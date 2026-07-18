import type { UpsertRulesSet } from '@blood-bowl-tracker/api-contract';
import type { Db, RulesSet } from '@blood-bowl-tracker/db';
import { DB, rulesSetExternalIds, rulesSets } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
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

  countAll(): Promise<number> {
    return countRows(this.db, rulesSets);
  }
}

import type { Db, RulesSet } from '@blood-bowl-tracker/db';
import { DB, rulesSetExternalIds, rulesSets } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

export class RulesSetUpsertConflictError extends Error {}

export interface UpsertRulesSetData {
  name: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class RulesSetsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertRulesSetData,
  ): Promise<{ rulesSet: RulesSet; created: boolean }> {
    const { ownerIds, existingRows } = await resolveExistingByExternalIds(
      this.db,
      rulesSetExternalIds,
      rulesSetExternalIds.rulesSetId,
      rulesSetExternalIds.externalSystemId,
      rulesSetExternalIds.externalId,
      data.externalIds,
    );

    if (ownerIds.length > 1) {
      throw new RulesSetUpsertConflictError(
        `External IDs matched multiple existing rules sets: ${ownerIds.join(', ')}`,
      );
    }

    let rulesSet: RulesSet;
    const created = ownerIds.length === 0;

    if (created) {
      const result = await this.db
        .insert(rulesSets)
        .values({ name: data.name })
        .returning();
      rulesSet = result[0];
    } else {
      const result = await this.db
        .update(rulesSets)
        .set({ name: data.name })
        .where(eq(rulesSets.id, ownerIds[0]))
        .returning();
      rulesSet = result[0];
    }

    await insertMissingExternalIds(
      this.db,
      rulesSetExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ rulesSetId: rulesSet.id, ...pair }),
    );

    return { rulesSet, created };
  }

  countAll(): Promise<number> {
    return countRows(this.db, rulesSets);
  }
}

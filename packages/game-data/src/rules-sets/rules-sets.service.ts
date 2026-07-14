import type { Db, RulesSet } from '@blood-bowl-tracker/db';
import { DB, rulesSetExternalIds, rulesSets } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

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
    const existingRows = await this.db
      .select({
        rulesSetId: rulesSetExternalIds.rulesSetId,
        externalSystemId: rulesSetExternalIds.externalSystemId,
        externalId: rulesSetExternalIds.externalId,
      })
      .from(rulesSetExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(rulesSetExternalIds.externalSystemId, e.externalSystemId),
              eq(rulesSetExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctRulesSetIds = [
      ...new Set(existingRows.map((r) => r.rulesSetId)),
    ];

    if (distinctRulesSetIds.length > 1) {
      throw new RulesSetUpsertConflictError(
        `External IDs matched multiple existing rules sets: ${distinctRulesSetIds.join(', ')}`,
      );
    }

    let rulesSet: RulesSet;
    const created = distinctRulesSetIds.length === 0;

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
        .where(eq(rulesSets.id, distinctRulesSetIds[0]))
        .returning();
      rulesSet = result[0];
    }

    await this.syncExternalIds(rulesSet.id, data.externalIds, existingRows);

    return { rulesSet, created };
  }

  private async syncExternalIds(
    rulesSetId: number,
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
      await this.db.insert(rulesSetExternalIds).values(
        newExternalIds.map((e) => ({
          rulesSetId,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }
  }

  countAll(): Promise<number> {
    return countRows(this.db, rulesSets);
  }
}

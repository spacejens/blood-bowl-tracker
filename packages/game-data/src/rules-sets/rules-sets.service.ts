import type { Db, RulesSet } from '@blood-bowl-tracker/db';
import {
  DB,
  raceRulesSets,
  rulesSetExternalIds,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

export class RulesSetUpsertConflictError extends Error {}

export interface UpsertRulesSetData {
  name: string;
  races: number[];
  externalIds: { externalSystemId: number; externalId: string }[];
}

export interface RulesSetWithRaces extends RulesSet {
  races: number[];
}

@Injectable()
export class RulesSetsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertRulesSetData,
  ): Promise<{ rulesSet: RulesSetWithRaces; created: boolean }> {
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

    const races = await this.syncRaces(rulesSet.id, data.races);
    await this.syncExternalIds(rulesSet.id, data.externalIds, existingRows);

    return { rulesSet: { ...rulesSet, races }, created };
  }

  private async syncRaces(
    rulesSetId: number,
    raceIds: number[],
  ): Promise<number[]> {
    const existing = await this.db
      .select({ raceId: raceRulesSets.raceId })
      .from(raceRulesSets)
      .where(eq(raceRulesSets.rulesSetId, rulesSetId));

    const existingIds = existing.map((r) => r.raceId);
    const existingSet = new Set(existingIds);
    const toInsert = raceIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await this.db
        .insert(raceRulesSets)
        .values(toInsert.map((raceId) => ({ rulesSetId, raceId })));
    }

    return [...existingIds, ...toInsert];
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

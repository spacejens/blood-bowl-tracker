import type {
  SyncAdvancementCosts,
  SyncAdvancementCostsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewAdvancementCost } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  DB,
  eq,
  inArray,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { AdvancementCostValidationError } from '../shared/advancement-cost-validation-error';

/**
 * Owns the advancement cost table: how many SPP each successive advancement
 * costs under each rules set.
 */
@Injectable()
export class AdvancementCostsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert or update the supplied costs, matched on their natural key
   * `(rulesSetId, advancementNumber, advancementKind)`. Idempotent: re-running
   * a sync rewrites `spp_cost` in place rather than duplicating rows, and an
   * unchanged re-run writes no history row.
   *
   * Deliberately *not* `INSERT ... ON CONFLICT`: `advancement_costs` is
   * history-tracked, and its BEFORE INSERT versioning trigger writes a history
   * row for every candidate row before Postgres checks the conflict, which
   * aborts the transaction (see docs/database.md, "History tracking").
   * Selecting first and issuing plain INSERT / UPDATE statements is the same
   * pattern `SppAwardValuesService.sync` uses.
   *
   * The whole batch is validated before any write: a batch naming one natural
   * key twice, or a cost naming a rules set that does not exist, is rejected
   * with an AdvancementCostValidationError naming it.
   */
  async sync(data: SyncAdvancementCosts): Promise<SyncAdvancementCostsResult> {
    if (data.costs.length === 0) {
      return { advancementCostIds: [] };
    }

    const rulesSetIds = [...new Set(data.costs.map((cost) => cost.rulesSetId))];
    await this.validateBatch(data, rulesSetIds);

    const existingRows = await this.db
      .select({
        id: advancementCosts.id,
        rulesSetId: advancementCosts.rulesSetId,
        advancementNumber: advancementCosts.advancementNumber,
        advancementKind: advancementCosts.advancementKind,
      })
      .from(advancementCosts)
      .where(inArray(advancementCosts.rulesSetId, rulesSetIds));

    const existingIdByKey = new Map(
      existingRows.map((row) => [this.naturalKey(row), row.id]),
    );

    const toInsert: NewAdvancementCost[] = [];
    const toUpdate: { id: number; sppCost: number }[] = [];
    for (const cost of data.costs) {
      const existingId = existingIdByKey.get(this.naturalKey(cost));
      if (existingId === undefined) {
        toInsert.push({
          rulesSetId: cost.rulesSetId,
          advancementNumber: cost.advancementNumber,
          advancementKind: cost.advancementKind,
          sppCost: cost.sppCost,
        });
      } else {
        toUpdate.push({ id: existingId, sppCost: cost.sppCost });
      }
    }

    // One transaction around the insert and every update: the caller treats
    // this call as one batch that either wholly succeeds or wholly fails.
    return this.db.transaction(async (tx) => {
      const advancementCostIds: number[] = [];

      if (toInsert.length > 0) {
        const inserted = await tx
          .insert(advancementCosts)
          .values(toInsert)
          .returning({ id: advancementCosts.id });
        advancementCostIds.push(...inserted.map((row) => row.id));
      }

      for (const row of toUpdate) {
        const updated = await tx
          .update(advancementCosts)
          .set({ sppCost: row.sppCost })
          .where(eq(advancementCosts.id, row.id))
          .returning({ id: advancementCosts.id });
        advancementCostIds.push(...updated.map((updatedRow) => updatedRow.id));
      }

      return { advancementCostIds };
    });
  }

  /**
   * Reject the batch when it names one natural key twice, or a cost names a
   * rules set that does not exist. A repeated key would otherwise collide on
   * the unique constraint or quietly let the last copy win, and a missing
   * rules set would surface as a raw foreign-key error. `rulesSetIds` is the
   * batch's distinct rules-set ids, which `sync` reuses for its lookup.
   */
  private async validateBatch(
    data: SyncAdvancementCosts,
    rulesSetIds: number[],
  ): Promise<void> {
    const seenKeys = new Set<string>();
    for (const cost of data.costs) {
      const key = this.naturalKey(cost);
      if (seenKeys.has(key)) {
        throw new AdvancementCostValidationError(
          `The ${cost.advancementKind} cost of advancement ${cost.advancementNumber} under rules set ${cost.rulesSetId} appears more than once in the same batch`,
        );
      }
      seenKeys.add(key);
    }

    const rulesSetRows = await this.db
      .select({ id: rulesSets.id })
      .from(rulesSets)
      .where(inArray(rulesSets.id, rulesSetIds));
    const knownRulesSetIds = new Set(rulesSetRows.map((row) => row.id));
    for (const cost of data.costs) {
      if (!knownRulesSetIds.has(cost.rulesSetId)) {
        throw new AdvancementCostValidationError(
          `Rules set ${cost.rulesSetId} does not exist, so no advancement cost can be recorded under it`,
        );
      }
    }
  }

  /** The cost's natural key as a string, for matching through a plain `Map`. */
  private naturalKey(row: {
    rulesSetId: number;
    advancementNumber: number;
    advancementKind: string;
  }): string {
    return `${row.rulesSetId}|${row.advancementNumber}|${row.advancementKind}`;
  }
}

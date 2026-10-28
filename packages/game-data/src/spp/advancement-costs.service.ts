import type {
  AdvancementCostEntry,
  SyncAdvancementCosts,
  SyncAdvancementCostsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewAdvancementCost } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  DB,
  eq,
  inArray,
  leagues,
  rulesSets,
  skills,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { AdvancementCostValidationError } from '../shared/advancement-cost-validation-error';

/** The fields of a cost, or of a stored row, that make up its natural key. */
interface NaturalKeyFields {
  rulesSetId: number;
  leagueId?: number | null;
  advancementNumber: number;
  advancementKind: string;
}

/**
 * Owns the advancement cost table: how many SPP each successive advancement
 * costs under each rules set, plus the extra advancements a league's house
 * rules add for that league's players.
 */
@Injectable()
export class AdvancementCostsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert or update the supplied costs, matched on their natural key
   * `(rulesSetId, leagueId, advancementNumber, advancementKind)`, where an
   * omitted league is the rules set's own cost. Idempotent: re-running a sync
   * rewrites `spp_cost` and `skill_id` in place rather than duplicating rows,
   * and an unchanged re-run writes no history row.
   *
   * Deliberately *not* `INSERT ... ON CONFLICT`: `advancement_costs` is
   * history-tracked, and its BEFORE INSERT versioning trigger writes a history
   * row for every candidate row before Postgres checks the conflict, which
   * aborts the transaction (see docs/database.md, "History tracking").
   * Selecting first and issuing plain INSERT / UPDATE statements is the same
   * pattern `SppAwardValuesService.sync` uses.
   *
   * The whole batch is validated before any write; see `validateBatch`.
   */
  async sync(data: SyncAdvancementCosts): Promise<SyncAdvancementCostsResult> {
    if (data.costs.length === 0) {
      return { advancementCostIds: [] };
    }

    const rulesSetIds = [...new Set(data.costs.map((cost) => cost.rulesSetId))];
    await this.validateBatch(data, rulesSetIds);

    // Over-fetch by rules set and match in memory: a league's rows share its
    // rules set's id, and a Map keyed on the nullable league avoids null-safe
    // comparison in SQL.
    const existingRows = await this.db
      .select({
        id: advancementCosts.id,
        rulesSetId: advancementCosts.rulesSetId,
        leagueId: advancementCosts.leagueId,
        advancementNumber: advancementCosts.advancementNumber,
        advancementKind: advancementCosts.advancementKind,
      })
      .from(advancementCosts)
      .where(inArray(advancementCosts.rulesSetId, rulesSetIds));

    const existingIdByKey = new Map(
      existingRows.map((row) => [this.naturalKey(row), row.id]),
    );

    const toInsert: NewAdvancementCost[] = [];
    const toUpdate: { id: number; sppCost: number; skillId: number | null }[] =
      [];
    for (const cost of data.costs) {
      const skillId = cost.skillId ?? null;
      const existingId = existingIdByKey.get(this.naturalKey(cost));
      if (existingId === undefined) {
        toInsert.push({
          rulesSetId: cost.rulesSetId,
          leagueId: cost.leagueId ?? null,
          advancementNumber: cost.advancementNumber,
          advancementKind: cost.advancementKind,
          skillId,
          sppCost: cost.sppCost,
        });
      } else {
        toUpdate.push({ id: existingId, sppCost: cost.sppCost, skillId });
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
          .set({ sppCost: row.sppCost, skillId: row.skillId })
          .where(eq(advancementCosts.id, row.id))
          .returning({ id: advancementCosts.id });
        advancementCostIds.push(...updated.map((updatedRow) => updatedRow.id));
      }

      return { advancementCostIds };
    });
  }

  /**
   * Reject the batch, with an AdvancementCostValidationError naming the
   * offending cost, when a cost's kind and skill disagree (a `granted_skill`
   * cost must name a skill and no other kind may), when it names one natural
   * key twice, or when a cost names a rules set, league or skill that does
   * not exist. A repeated key would otherwise collide on the unique
   * constraint or quietly let the last copy win, and a missing reference
   * would surface as a raw foreign-key error. The league and skill lookups
   * are skipped when no cost names one. `rulesSetIds` is the batch's distinct
   * rules-set ids, which `sync` reuses for its lookup.
   */
  private async validateBatch(
    data: SyncAdvancementCosts,
    rulesSetIds: number[],
  ): Promise<void> {
    const seenKeys = new Set<string>();
    for (const cost of data.costs) {
      this.assertSkillMatchesKind(cost);
      const key = this.naturalKey(cost);
      if (seenKeys.has(key)) {
        throw new AdvancementCostValidationError(
          `The ${cost.advancementKind} cost of ${this.describe(cost)} appears more than once in the same batch`,
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

    await this.assertLeaguesExist(data.costs);
    await this.assertSkillsExist(data.costs);
  }

  private assertSkillMatchesKind(cost: AdvancementCostEntry): void {
    if (
      cost.advancementKind === 'granted_skill' &&
      cost.skillId === undefined
    ) {
      throw new AdvancementCostValidationError(
        `The granted_skill cost of ${this.describe(cost)} names no skill to grant`,
      );
    }
    if (
      cost.advancementKind !== 'granted_skill' &&
      cost.skillId !== undefined
    ) {
      throw new AdvancementCostValidationError(
        `The ${cost.advancementKind} cost of ${this.describe(cost)} names skill ${cost.skillId}, but only a granted_skill advancement grants a fixed skill`,
      );
    }
  }

  private async assertLeaguesExist(
    costs: AdvancementCostEntry[],
  ): Promise<void> {
    const leagueIds = this.distinctIds(costs.map((cost) => cost.leagueId));
    if (leagueIds.length === 0) {
      return;
    }
    const rows = await this.db
      .select({ id: leagues.id })
      .from(leagues)
      .where(inArray(leagues.id, leagueIds));
    const known = new Set(rows.map((row) => row.id));
    const missing = leagueIds.find((id) => !known.has(id));
    if (missing !== undefined) {
      throw new AdvancementCostValidationError(
        `League ${missing} does not exist, so no advancement cost can be recorded for it`,
      );
    }
  }

  private async assertSkillsExist(
    costs: AdvancementCostEntry[],
  ): Promise<void> {
    const skillIds = this.distinctIds(costs.map((cost) => cost.skillId));
    if (skillIds.length === 0) {
      return;
    }
    const rows = await this.db
      .select({ id: skills.id })
      .from(skills)
      .where(inArray(skills.id, skillIds));
    const known = new Set(rows.map((row) => row.id));
    const missing = skillIds.find((id) => !known.has(id));
    if (missing !== undefined) {
      throw new AdvancementCostValidationError(
        `Skill ${missing} does not exist, so no advancement can grant it`,
      );
    }
  }

  private distinctIds(ids: (number | undefined)[]): number[] {
    return [...new Set(ids.filter((id): id is number => id !== undefined))];
  }

  /** "advancement N under rules set R", plus "for league L" on a league cost. */
  private describe(cost: AdvancementCostEntry): string {
    const base = `advancement ${cost.advancementNumber} under rules set ${cost.rulesSetId}`;
    return cost.leagueId === undefined
      ? base
      : `${base} for league ${cost.leagueId}`;
  }

  /** The cost's natural key as a string, for matching through a plain `Map`. */
  private naturalKey(row: NaturalKeyFields): string {
    return `${row.rulesSetId}|${row.leagueId ?? ''}|${row.advancementNumber}|${row.advancementKind}`;
  }
}

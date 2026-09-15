import type {
  SkillCategory,
  SyncSkillRulesSets,
  SyncSkillRulesSetsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewSkillRulesSet } from '@blood-bowl-tracker/db';
import {
  asc,
  DB,
  eq,
  inArray,
  rulesSets,
  skillRulesSets,
  skills,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { SkillValidationError } from '../shared/skill-validation-error';

/** One rules set's category for a given skill, named for display. */
export interface SkillRulesSetCategory {
  rulesSetId: number;
  rulesSetName: string;
  category: SkillCategory;
}

/** One skill's category under a given rules set, named for display. */
export interface RulesSetSkillCategory {
  skillId: number;
  skillName: string;
  category: SkillCategory;
}

/**
 * Owns the skill × rules-set association: which skills a rules set has, and
 * which category each falls into under it.
 *
 * Unlike PositionRulesSetsService, there is nothing to validate the category
 * *against* — the category is exactly what this table records, so no rules
 * set declares an expectation it could disagree with. The only rejection is a
 * batch naming the same pair twice, which the database's unique constraint
 * would otherwise turn into a raw driver error.
 */
@Injectable()
export class SkillRulesSetsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert or update the supplied rows, matched on their natural key
   * `(skillId, rulesSetId)`. Idempotent: re-syncing a pair rewrites its
   * category in place rather than duplicating the row.
   *
   * Deliberately *not* `INSERT ... ON CONFLICT DO UPDATE`, for the same
   * reason PositionRulesSetsService.sync is not: `skill_rules_sets` is
   * history-tracked, and Postgres fires the row-level BEFORE INSERT
   * versioning trigger for every candidate row of an ON CONFLICT statement,
   * writing a history row keyed by a serial id that never lands in the parent
   * table. Selecting first and then issuing plain INSERT / UPDATE statements
   * avoids that.
   *
   * Validation runs over the whole batch before any write: one bad entry
   * fails the call rather than half-applying it.
   */
  async sync(data: SyncSkillRulesSets): Promise<SyncSkillRulesSetsResult> {
    if (data.entries.length === 0) {
      return { skillRulesSetIds: [] };
    }

    const seenKeys = new Set<string>();
    for (const entry of data.entries) {
      const key = this.naturalKey(entry);
      if (seenKeys.has(key)) {
        throw new SkillValidationError(
          `Skill ${entry.skillId} under rules set ${entry.rulesSetId} appears more than once in the same batch`,
        );
      }
      seenKeys.add(key);
    }

    const rulesSetIds = [
      ...new Set(data.entries.map((entry) => entry.rulesSetId)),
    ];
    // Over-fetch by rules set and match in memory: one query regardless of
    // how many pairs the batch carries, and no null-safety awkwardness.
    const existingRows = await this.db
      .select({
        id: skillRulesSets.id,
        skillId: skillRulesSets.skillId,
        rulesSetId: skillRulesSets.rulesSetId,
      })
      .from(skillRulesSets)
      .where(inArray(skillRulesSets.rulesSetId, rulesSetIds));

    const existingIdByKey = new Map(
      existingRows.map((row) => [this.naturalKey(row), row.id]),
    );

    const toInsert: NewSkillRulesSet[] = [];
    const toUpdate: { id: number; category: SkillCategory }[] = [];
    for (const entry of data.entries) {
      const existingId = existingIdByKey.get(this.naturalKey(entry));
      if (existingId === undefined) {
        toInsert.push({
          skillId: entry.skillId,
          rulesSetId: entry.rulesSetId,
          category: entry.category,
        });
      } else {
        toUpdate.push({ id: existingId, category: entry.category });
      }
    }

    // One transaction around the insert and every update: the caller treats
    // this single call as one batch that either wholly succeeds or wholly
    // fails.
    return this.db.transaction(async (tx) => {
      const skillRulesSetIds: number[] = [];

      if (toInsert.length > 0) {
        const inserted = await tx
          .insert(skillRulesSets)
          .values(toInsert)
          .returning({ id: skillRulesSets.id });
        skillRulesSetIds.push(...inserted.map((row) => row.id));
      }

      for (const row of toUpdate) {
        const updated = await tx
          .update(skillRulesSets)
          .set({ category: row.category })
          .where(eq(skillRulesSets.id, row.id))
          .returning({ id: skillRulesSets.id });
        skillRulesSetIds.push(...updated.map((updatedRow) => updatedRow.id));
      }

      return { skillRulesSetIds };
    });
  }

  /**
   * Every rules set that has this skill, with its category under each,
   * ordered by rules-set name so the list is stable across calls.
   */
  listBySkill(skillId: number): Promise<SkillRulesSetCategory[]> {
    return this.db
      .select({
        rulesSetId: rulesSets.id,
        rulesSetName: rulesSets.name,
        category: skillRulesSets.category,
      })
      .from(skillRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, skillRulesSets.rulesSetId))
      .where(eq(skillRulesSets.skillId, skillId))
      .orderBy(asc(rulesSets.name));
  }

  /**
   * Every skill this rules set has, with its category, ordered by skill name.
   * The mirror of listBySkill, for a caller holding a rules set rather than a
   * skill — the read #864's importer and #865's views will need. Not exposed
   * over the contract by this issue; see the plan's implementer notes.
   */
  listByRulesSet(rulesSetId: number): Promise<RulesSetSkillCategory[]> {
    return this.db
      .select({
        skillId: skills.id,
        skillName: skills.name,
        category: skillRulesSets.category,
      })
      .from(skillRulesSets)
      .innerJoin(skills, eq(skills.id, skillRulesSets.skillId))
      .where(eq(skillRulesSets.rulesSetId, rulesSetId))
      .orderBy(asc(skills.name));
  }

  /**
   * The row's natural key as a string, so existing rows and incoming entries
   * can be matched through a plain `Map`.
   */
  private naturalKey(row: { skillId: number; rulesSetId: number }): string {
    return `${row.skillId}|${row.rulesSetId}`;
  }
}

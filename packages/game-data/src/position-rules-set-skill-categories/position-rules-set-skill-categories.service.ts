import type {
  PositionRulesSetSkillCategoriesEntry,
  SyncPositionRulesSetSkillCategories,
  SyncPositionRulesSetSkillCategoriesResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  inArray,
  positionRulesSets,
  positionRulesSetSkillCategories,
} from '@blood-bowl-tracker/db';
import type {
  SkillAccess,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';
import { LEARNABLE_SKILL_CATEGORIES } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { PositionSkillCategoryValidationError } from '../shared/position-skill-category-validation-error';

/** One category a pair should hold, with its anchor row resolved. */
interface DesiredRow {
  positionRulesSetId: number;
  skillCategory: SkillCategory;
  access: SkillAccess;
}

/** One stored row, as the diff reads it. */
interface StoredRow extends DesiredRow {
  id: number;
  removed: boolean;
}

/** What one sync must write to make the stored rows match the batch. */
interface SkillCategoryDiff {
  toInsert: DesiredRow[];
  toUpdate: { id: number; access: SkillAccess; removed: boolean }[];
}

const LEARNABLE = new Set<SkillCategory>(LEARNABLE_SKILL_CATEGORIES);

/**
 * Owns the position × rules-set × skill-category association: which
 * categories a position may take skills from under one rules set, and
 * whether each is primary or secondary.
 *
 * Each entry is a pair's complete set, keyed by `(positionId, rulesSetId)`.
 * The anchor `position_rules_sets` row is resolved here. That is also what
 * enforces that categories are only recorded for a pair with characteristics.
 *
 * The sync is a diff, not a replace, because rows are history-tracked and can
 * never be deleted (docs/database.md):
 * - a missing category is inserted;
 * - a moved category has its `access` updated in place;
 * - a category the set no longer lists is flagged `removed`;
 * - a flagged category that is listed again is revived;
 * - an unchanged set writes nothing, so re-running an import adds no history.
 */
@Injectable()
export class PositionRulesSetSkillCategoriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Sync every entry's pair to exactly its listed categories. The whole
   * batch is validated before any write and written in one transaction, so
   * one bad entry fails the call rather than half-applying it.
   */
  async sync(
    data: SyncPositionRulesSetSkillCategories,
  ): Promise<SyncPositionRulesSetSkillCategoriesResult> {
    if (data.entries.length === 0) {
      return { positionRulesSetSkillCategoryIds: [] };
    }
    this.validateEntries(data.entries);
    const anchorIds = await this.resolveAnchors(data.entries);
    const desired = data.entries.flatMap((entry, index) =>
      this.desiredRows(entry, anchorIds[index]),
    );

    const storedRows: StoredRow[] = await this.db
      .select({
        id: positionRulesSetSkillCategories.id,
        positionRulesSetId: positionRulesSetSkillCategories.positionRulesSetId,
        skillCategory: positionRulesSetSkillCategories.skillCategory,
        access: positionRulesSetSkillCategories.access,
        removed: positionRulesSetSkillCategories.removed,
      })
      .from(positionRulesSetSkillCategories)
      .where(
        inArray(positionRulesSetSkillCategories.positionRulesSetId, anchorIds),
      );
    const storedByKey = new Map(storedRows.map((row) => [this.key(row), row]));

    const diff = this.diff(desired, storedRows);
    if (diff.toInsert.length === 0 && diff.toUpdate.length === 0) {
      return this.result(desired, storedByKey, new Map());
    }

    // One transaction around every write: the caller treats this call as one
    // batch that either wholly succeeds or wholly fails.
    return this.db.transaction(async (tx) => {
      for (const row of diff.toUpdate) {
        await tx
          .update(positionRulesSetSkillCategories)
          .set({ access: row.access, removed: row.removed })
          .where(eq(positionRulesSetSkillCategories.id, row.id));
      }
      const insertedIdByKey = new Map<string, number>();
      if (diff.toInsert.length > 0) {
        const inserted = await tx
          .insert(positionRulesSetSkillCategories)
          .values(diff.toInsert)
          .returning({
            id: positionRulesSetSkillCategories.id,
            positionRulesSetId:
              positionRulesSetSkillCategories.positionRulesSetId,
            skillCategory: positionRulesSetSkillCategories.skillCategory,
          });
        // INSERT ... RETURNING does not promise input order: match by key.
        for (const row of inserted) {
          insertedIdByKey.set(this.key(row), row.id);
        }
      }
      return this.result(desired, storedByKey, insertedIdByKey);
    });
  }

  /**
   * Reject a batch naming one pair twice, a trait or unique category, or a
   * category listed twice for one pair, before any query runs.
   */
  private validateEntries(
    entries: PositionRulesSetSkillCategoriesEntry[],
  ): void {
    const seenPairs = new Set<string>();
    for (const entry of entries) {
      const pair = `Position ${entry.positionId} under rules set ${entry.rulesSetId}`;
      const pairKey = `${entry.positionId}|${entry.rulesSetId}`;
      if (seenPairs.has(pairKey)) {
        throw new PositionSkillCategoryValidationError(
          `${pair} appears more than once in the same batch`,
        );
      }
      seenPairs.add(pairKey);
      const seenCategories = new Set<SkillCategory>();
      for (const category of [...entry.primary, ...entry.secondary]) {
        if (!LEARNABLE.has(category)) {
          throw new PositionSkillCategoryValidationError(
            `${pair} cannot take skill category ${category}: only general, agility, passing, strength, mutation and devious can be primary or secondary`,
          );
        }
        if (seenCategories.has(category)) {
          throw new PositionSkillCategoryValidationError(
            `${pair} lists skill category ${category} more than once`,
          );
        }
        seenCategories.add(category);
      }
    }
  }

  /**
   * Each entry's `position_rules_sets` id, by entry index. One query scoped
   * to the batch's positions and rules sets, matched in memory.
   */
  private async resolveAnchors(
    entries: PositionRulesSetSkillCategoriesEntry[],
  ): Promise<number[]> {
    const rulesSetIds = [...new Set(entries.map((e) => e.rulesSetId))];
    const positionIds = [...new Set(entries.map((e) => e.positionId))];
    const rows = await this.db
      .select({
        id: positionRulesSets.id,
        positionId: positionRulesSets.positionId,
        rulesSetId: positionRulesSets.rulesSetId,
      })
      .from(positionRulesSets)
      .where(
        and(
          inArray(positionRulesSets.rulesSetId, rulesSetIds),
          inArray(positionRulesSets.positionId, positionIds),
        ),
      );
    const idByPair = new Map(
      rows.map((row) => [`${row.positionId}|${row.rulesSetId}`, row.id]),
    );
    return entries.map((entry) => {
      const id = idByPair.get(`${entry.positionId}|${entry.rulesSetId}`);
      if (id === undefined) {
        throw new PositionSkillCategoryValidationError(
          `Position ${entry.positionId} has no characteristics recorded under rules set ${entry.rulesSetId}, so it cannot carry skill categories there`,
        );
      }
      return id;
    });
  }

  private desiredRows(
    entry: PositionRulesSetSkillCategoriesEntry,
    positionRulesSetId: number,
  ): DesiredRow[] {
    return [
      ...entry.primary.map((skillCategory) => ({
        positionRulesSetId,
        skillCategory,
        access: 'primary' as const,
      })),
      ...entry.secondary.map((skillCategory) => ({
        positionRulesSetId,
        skillCategory,
        access: 'secondary' as const,
      })),
    ];
  }

  private diff(desired: DesiredRow[], stored: StoredRow[]): SkillCategoryDiff {
    const storedByKey = new Map(stored.map((row) => [this.key(row), row]));
    const desiredKeys = new Set(desired.map((row) => this.key(row)));
    const diff: SkillCategoryDiff = { toInsert: [], toUpdate: [] };
    for (const row of desired) {
      const existing = storedByKey.get(this.key(row));
      if (existing === undefined) {
        diff.toInsert.push(row);
      } else if (existing.removed || existing.access !== row.access) {
        diff.toUpdate.push({
          id: existing.id,
          access: row.access,
          removed: false,
        });
      }
    }
    for (const row of stored) {
      if (!row.removed && !desiredKeys.has(this.key(row))) {
        diff.toUpdate.push({ id: row.id, access: row.access, removed: true });
      }
    }
    return diff;
  }

  private result(
    desired: DesiredRow[],
    storedByKey: Map<string, StoredRow>,
    insertedIdByKey: Map<string, number>,
  ): SyncPositionRulesSetSkillCategoriesResult {
    return {
      positionRulesSetSkillCategoryIds: desired.map((row) => {
        const key = this.key(row);
        const id = storedByKey.get(key)?.id ?? insertedIdByKey.get(key);
        if (id === undefined) {
          // Every desired row was stored already or inserted in this call.
          throw new Error(
            `Insert into position_rules_set_skill_categories did not return a row for key ${key}`,
          );
        }
        return id;
      }),
    };
  }

  private key(row: {
    positionRulesSetId: number;
    skillCategory: SkillCategory;
  }): string {
    return `${row.positionRulesSetId}|${row.skillCategory}`;
  }
}

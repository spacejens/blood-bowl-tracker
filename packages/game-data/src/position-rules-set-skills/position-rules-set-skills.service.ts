import type {
  SyncPositionRulesSetSkills,
  SyncPositionRulesSetSkillsResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db, NewPositionRulesSetSkill } from '@blood-bowl-tracker/db';
import {
  asc,
  DB,
  eq,
  inArray,
  positionRulesSets,
  positionRulesSetSkills,
  rulesSets,
  skillRulesSets,
  skills,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { SkillValidationError } from '../shared/skill-validation-error';

/** One starting skill of a position under one rules set, named for display. */
export interface PositionStartingSkill {
  rulesSetId: number;
  rulesSetName: string;
  skillId: number;
  skillName: string;
  isStarPlayerUniqueSkill: boolean;
}

/** One entry with its `position_rules_sets` row already resolved. */
interface ResolvedStartingSkill {
  positionRulesSetId: number;
  skillId: number;
  isStarPlayerUniqueSkill: boolean;
}

/**
 * Owns the position × rules-set × skill association: a position's starting
 * skills under one rules set.
 *
 * Callers key entries by `(positionId, rulesSetId, skillId)`, never by the
 * internal `position_rules_sets.id` — they hold position and rules-set ids
 * from their own upserts and have no reason to know the association's own id.
 * This service resolves that row itself, which is also what enforces the
 * table's anchoring rule: a starting skill cannot be recorded for a
 * position/rules-set pair whose characteristics have not been synced yet.
 *
 * It additionally rejects a skill with no `skill_rules_sets` row for the same
 * rules set, the same way PositionRulesSetsService.sync defers to
 * CharacteristicFormatValidationService to check that characteristics agree
 * with what the rules set declares — in both cases a database constraint
 * cannot express the rule, because it spans another table's row.
 */
@Injectable()
export class PositionRulesSetSkillsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert or update the supplied starting skills, matched on their natural
   * key `(positionId, rulesSetId, skillId)`. Idempotent: re-syncing a triple
   * rewrites its `isStarPlayerUniqueSkill` flag in place.
   *
   * Deliberately *not* `INSERT ... ON CONFLICT DO UPDATE`, for the same
   * history-trigger reason PositionRulesSetsService.sync avoids it.
   *
   * Every validation runs over the whole batch before any write, so one bad
   * entry fails the call rather than half-applying it. This includes the
   * `is_star_player_unique_skill` flag: at most one skill per position/rules
   * set may carry it, checked both within the batch itself and against
   * whatever already exists in the table (mirroring the database's own
   * partial unique index, so a violation surfaces as this method's clearer
   * error rather than a raw constraint failure).
   */
  async sync(
    data: SyncPositionRulesSetSkills,
  ): Promise<SyncPositionRulesSetSkillsResult> {
    if (data.entries.length === 0) {
      return { positionRulesSetSkillIds: [] };
    }

    const rulesSetIds = [
      ...new Set(data.entries.map((entry) => entry.rulesSetId)),
    ];

    // Over-fetch both preconditions by rules set and match in memory: two
    // queries regardless of how many entries the batch carries.
    const associationRows = await this.db
      .select({
        id: positionRulesSets.id,
        positionId: positionRulesSets.positionId,
        rulesSetId: positionRulesSets.rulesSetId,
      })
      .from(positionRulesSets)
      .where(inArray(positionRulesSets.rulesSetId, rulesSetIds));

    const availableSkillRows = await this.db
      .select({
        skillId: skillRulesSets.skillId,
        rulesSetId: skillRulesSets.rulesSetId,
      })
      .from(skillRulesSets)
      .where(inArray(skillRulesSets.rulesSetId, rulesSetIds));

    const associationIdByKey = new Map(
      associationRows.map((row) => [
        `${row.positionId}|${row.rulesSetId}`,
        row.id,
      ]),
    );
    const availableSkillKeys = new Set(
      availableSkillRows.map((row) => `${row.skillId}|${row.rulesSetId}`),
    );

    const resolved: ResolvedStartingSkill[] = [];
    const seenKeys = new Set<string>();
    // Tracks, per association row, which entry (if any) in this batch has
    // already claimed the star-player-unique-skill flag there — so a second
    // entry for the same position/rules set claiming it too is caught before
    // any write, with a message naming both conflicting skills.
    const starPlayerUniqueSkillByAssociation = new Map<
      number,
      { skillId: number; positionId: number; rulesSetId: number }
    >();
    for (const entry of data.entries) {
      const associationId = associationIdByKey.get(
        `${entry.positionId}|${entry.rulesSetId}`,
      );
      if (associationId === undefined) {
        throw new SkillValidationError(
          `Position ${entry.positionId} has no characteristics recorded under rules set ${entry.rulesSetId}, so it cannot have starting skills there`,
        );
      }
      if (!availableSkillKeys.has(`${entry.skillId}|${entry.rulesSetId}`)) {
        throw new SkillValidationError(
          `Skill ${entry.skillId} does not exist under rules set ${entry.rulesSetId}, so position ${entry.positionId} cannot start with it`,
        );
      }
      // Checked after the two lookups so the clearer "does not exist" message
      // always wins for an entry that is wrong in both ways. Without this
      // check, two entries for the same triple would both take the insert
      // path below and collide on the table's unique constraint, raising a
      // raw database error instead of this method's own, clearer one.
      const key = `${associationId}|${entry.skillId}`;
      if (seenKeys.has(key)) {
        throw new SkillValidationError(
          `Position ${entry.positionId} under rules set ${entry.rulesSetId} lists skill ${entry.skillId} more than once in the same batch`,
        );
      }
      seenKeys.add(key);
      if (entry.isStarPlayerUniqueSkill) {
        const claimedBy = starPlayerUniqueSkillByAssociation.get(associationId);
        if (claimedBy !== undefined && claimedBy.skillId !== entry.skillId) {
          throw new SkillValidationError(
            `Position ${entry.positionId} under rules set ${entry.rulesSetId} marks both skill ${claimedBy.skillId} and skill ${entry.skillId} as the star player's unique skill in the same batch`,
          );
        }
        starPlayerUniqueSkillByAssociation.set(associationId, {
          skillId: entry.skillId,
          positionId: entry.positionId,
          rulesSetId: entry.rulesSetId,
        });
      }
      resolved.push({
        positionRulesSetId: associationId,
        skillId: entry.skillId,
        isStarPlayerUniqueSkill: entry.isStarPlayerUniqueSkill,
      });
    }

    const associationIds = [
      ...new Set(resolved.map((row) => row.positionRulesSetId)),
    ];
    const existingRows = await this.db
      .select({
        id: positionRulesSetSkills.id,
        positionRulesSetId: positionRulesSetSkills.positionRulesSetId,
        skillId: positionRulesSetSkills.skillId,
        isStarPlayerUniqueSkill: positionRulesSetSkills.isStarPlayerUniqueSkill,
      })
      .from(positionRulesSetSkills)
      .where(
        inArray(positionRulesSetSkills.positionRulesSetId, associationIds),
      );

    const existingIdByKey = new Map(
      existingRows.map((row) => [
        `${row.positionRulesSetId}|${row.skillId}`,
        row.id,
      ]),
    );

    // What this batch itself will leave every named (association, skill) row
    // flagged as, keyed the same way as `existingIdByKey`. Used below to tell
    // an existing flagged row that the batch is *reassigning away from* (not
    // a conflict) from one the batch leaves untouched (still a conflict).
    const resolvedFlagByKey = new Map(
      resolved.map((row) => [
        `${row.positionRulesSetId}|${row.skillId}`,
        row.isStarPlayerUniqueSkill,
      ]),
    );

    // A batch entry claiming the flag can only conflict with an *existing*
    // row's flag when, after the whole batch is applied, that existing row
    // is still flagged for a different skill. An existing row the batch
    // itself clears (or that the batch updates in place for the same skill)
    // is not a conflict — checking raw persisted state here, rather than the
    // batch's projected final state, would wrongly reject a legitimate
    // reassignment (batch clears skill A's flag while setting it on skill B
    // for the same position/rules set).
    for (const existingRow of existingRows) {
      if (!existingRow.isStarPlayerUniqueSkill) continue;
      const batchFlag = resolvedFlagByKey.get(
        `${existingRow.positionRulesSetId}|${existingRow.skillId}`,
      );
      if (batchFlag === false) continue;
      const claimedBy = starPlayerUniqueSkillByAssociation.get(
        existingRow.positionRulesSetId,
      );
      if (
        claimedBy !== undefined &&
        claimedBy.skillId !== existingRow.skillId
      ) {
        throw new SkillValidationError(
          `Position ${claimedBy.positionId} under rules set ${claimedBy.rulesSetId} cannot mark skill ${claimedBy.skillId} as the star player's unique skill: skill ${existingRow.skillId} already has that flag there`,
        );
      }
    }

    const toInsert: NewPositionRulesSetSkill[] = [];
    const toUpdate: { id: number; isStarPlayerUniqueSkill: boolean }[] = [];
    for (const row of resolved) {
      const existingId = existingIdByKey.get(
        `${row.positionRulesSetId}|${row.skillId}`,
      );
      if (existingId === undefined) {
        toInsert.push(row);
      } else {
        toUpdate.push({
          id: existingId,
          isStarPlayerUniqueSkill: row.isStarPlayerUniqueSkill,
        });
      }
    }

    // The partial unique index on `position_rules_set_id` (where the flag is
    // true) is checked immediately, per statement — it is a plain unique
    // index, not a deferrable constraint. So within one position/rules set, a
    // reassignment batch (clear skill A, set skill B) must have every
    // clearing write land before every flag-setting write, or the
    // flag-setting write would transiently collide with the not-yet-cleared
    // row. Splitting into a "clear" phase followed by a "set" phase, each
    // ordered before the other across both inserts and updates, guarantees
    // that regardless of the order entries arrived in the request.
    const clearInserts = toInsert.filter((row) => !row.isStarPlayerUniqueSkill);
    const setInserts = toInsert.filter((row) => row.isStarPlayerUniqueSkill);
    const clearUpdates = toUpdate.filter((row) => !row.isStarPlayerUniqueSkill);
    const setUpdates = toUpdate.filter((row) => row.isStarPlayerUniqueSkill);

    // One transaction around every insert and update: the caller treats this
    // single call as one batch that either wholly succeeds or wholly fails.
    return this.db.transaction(async (tx) => {
      const positionRulesSetSkillIds: number[] = [];

      const insertGroup = async (
        rows: NewPositionRulesSetSkill[],
      ): Promise<void> => {
        if (rows.length === 0) return;
        const inserted = await tx
          .insert(positionRulesSetSkills)
          .values(rows)
          .returning({ id: positionRulesSetSkills.id });
        positionRulesSetSkillIds.push(...inserted.map((row) => row.id));
      };
      const updateGroup = async (
        rows: { id: number; isStarPlayerUniqueSkill: boolean }[],
      ): Promise<void> => {
        for (const row of rows) {
          const updated = await tx
            .update(positionRulesSetSkills)
            .set({ isStarPlayerUniqueSkill: row.isStarPlayerUniqueSkill })
            .where(eq(positionRulesSetSkills.id, row.id))
            .returning({ id: positionRulesSetSkills.id });
          positionRulesSetSkillIds.push(
            ...updated.map((updatedRow) => updatedRow.id),
          );
        }
      };

      await insertGroup(clearInserts);
      await updateGroup(clearUpdates);
      await insertGroup(setInserts);
      await updateGroup(setUpdates);

      return { positionRulesSetSkillIds };
    });
  }

  /**
   * Every starting skill recorded for this position, across every rules set,
   * ordered by rules-set name then skill name so the list is stable across
   * calls. The join reaches the position through `position_rules_sets`, which
   * is the only place the position id is stored.
   */
  listByPosition(positionId: number): Promise<PositionStartingSkill[]> {
    return this.db
      .select({
        rulesSetId: rulesSets.id,
        rulesSetName: rulesSets.name,
        skillId: skills.id,
        skillName: skills.name,
        isStarPlayerUniqueSkill: positionRulesSetSkills.isStarPlayerUniqueSkill,
      })
      .from(positionRulesSetSkills)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetSkills.positionRulesSetId),
      )
      .innerJoin(rulesSets, eq(rulesSets.id, positionRulesSets.rulesSetId))
      .innerJoin(skills, eq(skills.id, positionRulesSetSkills.skillId))
      .where(eq(positionRulesSets.positionId, positionId))
      .orderBy(asc(rulesSets.name), asc(skills.name));
  }
}

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
}

/** One entry with its `position_rules_sets` row already resolved. */
interface ResolvedStartingSkill {
  positionRulesSetId: number;
  skillId: number;
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
 *
 * A star player's exclusive skill carries no special handling here: it is
 * identified purely by its `skill_rules_sets` category being `unique` for the
 * relevant rules set, which this service neither reads nor validates. Any
 * skill may be a starting skill of any number of positions.
 */
@Injectable()
export class PositionRulesSetSkillsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Insert or update the supplied starting skills, matched on their natural
   * key `(positionId, rulesSetId, skillId)`. Idempotent: re-syncing a triple
   * is a no-op write to the same row.
   *
   * Deliberately *not* `INSERT ... ON CONFLICT DO UPDATE`, for the same
   * history-trigger reason PositionRulesSetsService.sync avoids it.
   *
   * Every validation runs over the whole batch before any write, so one bad
   * entry fails the call rather than half-applying it.
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
      resolved.push({
        positionRulesSetId: associationId,
        skillId: entry.skillId,
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

    // A row's full identity is its (positionRulesSetId, skillId) key, and
    // that is also its natural key — there is no other column left to
    // change, so an entry matching an existing row needs no write at all;
    // its id is simply carried through. Only entries with no existing row
    // need an insert.
    const existingIds: number[] = [];
    const toInsert: NewPositionRulesSetSkill[] = [];
    for (const row of resolved) {
      const existingId = existingIdByKey.get(
        `${row.positionRulesSetId}|${row.skillId}`,
      );
      if (existingId === undefined) {
        toInsert.push(row);
      } else {
        existingIds.push(existingId);
      }
    }

    if (toInsert.length === 0) {
      return { positionRulesSetSkillIds: existingIds };
    }

    // One transaction around every insert: the caller treats this single
    // call as one batch that either wholly succeeds or wholly fails.
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(positionRulesSetSkills)
        .values(toInsert)
        .returning({ id: positionRulesSetSkills.id });
      return {
        positionRulesSetSkillIds: [
          ...existingIds,
          ...inserted.map((row) => row.id),
        ],
      };
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

import { boolean, integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { gameData } from './pg-schema';
import { positionRulesSets } from './position-rules-sets';
import { skills } from './skills';

/**
 * One starting skill of a position (or star player) under one rules set.
 *
 * Anchored to `position_rules_sets.id` rather than to duplicated
 * `position_id` / `rules_set_id` columns, so a starting skill can only ever
 * be recorded against a position/rules-set pair that already has
 * characteristics recorded — a position's starting skills cannot be synced
 * ahead of its characteristics.
 *
 * `is_star_player_unique_skill` marks the one skill a rules set makes
 * exclusive to a given star player. It is on this association row rather than
 * on `skills`, because the same skill row has to stay shareable across every
 * position that starts with it — nothing about a skill's identity requires it
 * to be used only once.
 *
 * That a skill named here also has a `skill_rules_sets` row for the same
 * rules set is enforced in PositionRulesSetSkillsService, not by a database
 * constraint: the rule spans another table's row, exactly like the
 * characteristic-format rule on `position_rules_sets`.
 */
const positionRulesSetSkillsTable = historyTrackedTable({
  schema: gameData,
  name: 'position_rules_set_skills',
  columns: {
    id: serial('id').primaryKey(),
    positionRulesSetId: integer('position_rules_set_id')
      .references(() => positionRulesSets.id)
      .notNull(),
    skillId: integer('skill_id')
      .references(() => skills.id)
      .notNull(),
    isStarPlayerUniqueSkill: boolean('is_star_player_unique_skill')
      .notNull()
      .default(false),
  },
  extraConfig: (t) => ({
    uniquePositionRulesSetSkill: unique(
      'position_rules_set_skills_position_rules_set_id_skill_id_unique',
    ).on(t.positionRulesSetId, t.skillId),
  }),
});

export const positionRulesSetSkills = positionRulesSetSkillsTable.table;
export const positionRulesSetSkillsHistory =
  positionRulesSetSkillsTable.historyTable;

export type PositionRulesSetSkill = typeof positionRulesSetSkills.$inferSelect;
export type NewPositionRulesSetSkill =
  typeof positionRulesSetSkills.$inferInsert;

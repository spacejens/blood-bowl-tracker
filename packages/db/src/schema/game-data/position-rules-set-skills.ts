import { integer, serial, text, unique } from 'drizzle-orm/pg-core';

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
 * A star player's exclusive skill carries no per-association marking here:
 * it is identified purely by checking that the skill's `skill_rules_sets`
 * category is `unique` for the relevant rules set. There is no database (or
 * application) enforcement that a `unique`-category skill is actually used
 * by only one star player — any number of positions may start with the same
 * skill, `unique`-category or not, with no special-casing.
 *
 * That a skill named here also has a `skill_rules_sets` row for the same
 * rules set is enforced in PositionRulesSetSkillsService, not by a database
 * constraint: the rule spans another table's row, exactly like the
 * characteristic-format rule on `position_rules_sets`.
 *
 * `attributeValue` carries a position-specific variant of the skill that is
 * no longer part of the skill's own identity — e.g. "Loner (4+)"'s "4+", or
 * "Animosity (Orc Linemen)"'s "Orc Linemen" — now that skill identity is just
 * the base name. It is nullable because most starting skills carry no such
 * detail at all.
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
    attributeValue: text('attribute_value'),
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

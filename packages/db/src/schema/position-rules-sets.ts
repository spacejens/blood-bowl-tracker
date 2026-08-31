import { integer, serial, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from './history';
import { gameData } from './pg-schema';
import { positions } from './positions';
import { rulesSets } from './rules-sets';

/**
 * The position × rules-set association, carrying that position's
 * characteristics under that rules set. The same position genuinely differs
 * between rules sets (a Zombie Lineman gains a Passing value between DB2021
 * and BB2025; a Bodyguard loses a point of Move), so characteristics cannot
 * live on `positions`.
 *
 * Named for the association rather than narrowly for "characteristics" on
 * purpose: later work under the parent issue may add further per-rules-set
 * columns here or reference this table's id, instead of each needing its own
 * position/rules-set join table.
 *
 * A missing row for a pair means the position did not exist under that rules
 * set — no explicit "not applicable" marker is needed.
 *
 * `passing` is nullable because a rules set whose `passing_format` is
 * 'absent' has no Passing characteristic at all. Which of the five values may
 * (and must) be present is enforced in PositionRulesSetsService against the
 * rules set's declared formats, not by a database constraint: the rule
 * depends on another table's row.
 */
const positionRulesSetsTable = historyTrackedTable({
  schema: gameData,
  name: 'position_rules_sets',
  columns: {
    id: serial('id').primaryKey(),
    positionId: integer('position_id')
      .references(() => positions.id)
      .notNull(),
    rulesSetId: integer('rules_set_id')
      .references(() => rulesSets.id)
      .notNull(),
    move: integer('move').notNull(),
    strength: integer('strength').notNull(),
    agility: integer('agility').notNull(),
    passing: integer('passing'),
    armour: integer('armour').notNull(),
  },
  extraConfig: (t) => ({
    uniquePositionRulesSet: unique(
      'position_rules_sets_position_id_rules_set_id_unique',
    ).on(t.positionId, t.rulesSetId),
  }),
});

export const positionRulesSets = positionRulesSetsTable.table;
export const positionRulesSetsHistory = positionRulesSetsTable.historyTable;

export type PositionRulesSet = typeof positionRulesSets.$inferSelect;
export type NewPositionRulesSet = typeof positionRulesSets.$inferInsert;

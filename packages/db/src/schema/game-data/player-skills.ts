import { PLAYER_SKILL_SOURCES } from '@blood-bowl-tracker/domain-enums';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  serial,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { gameData } from './pg-schema';
import { players } from './players';
import { skills } from './skills';

/**
 * See `PLAYER_SKILL_SOURCES` in `@blood-bowl-tracker/domain-enums` for what
 * each source means and why one unified table carries starting and gained
 * skills alike.
 */
export const playerSkillSourceEnum = gameData.enum(
  'player_skill_source',
  PLAYER_SKILL_SOURCES,
);

/**
 * Every skill one player has — starting skills included — tagged with how
 * they came by it.
 *
 * Anchored directly to `players.id` rather than reached through the player's
 * position: a player's own skill set diverges from their position's the
 * moment they take an advancement, and a star player hired by several teams
 * is a separate `players` row per hire.
 *
 * `attributeValue` carries a skill variant that is not part of the skill's
 * own identity — e.g. Hatred's target race, or Loner's roll number — the same
 * purpose it serves on `position_rules_set_skills`. It is needed at the
 * player level too because BB2025's Hatred can be picked more than once by
 * the same player, each time against a different target, which is why it
 * participates in the unique constraint below.
 *
 * `advancementOrder` is best-effort and unverified: neither BBL nor TP
 * records a confirmed sequence, only a presentation-order proxy (BBL's
 * ordered advancement list, TP's array position). It is only ever meaningful
 * for a gained row (`advancement`, `chosen` or `random`) — a `starting` row
 * always leaves it null, since a starting skill set has no sequence.
 *
 * No cross-table category validation happens here or in PlayerSkillsService:
 * a gained row (`advancement`, `chosen` or `random`) is deliberately NOT
 * checked against the skill's `skill_rules_sets` category (e.g. rejecting a
 * `trait` or `unique` skill
 * that no advancement can grant under the base rules). Imported data is
 * trusted as the external source's own record, because house rules and
 * competition-specific quirks can legitimately produce a combination that
 * looks impossible.
 *
 * `isFreeExtra` marks a gained skill the player has without having spent SPP
 * on it and that is not one of their advancements, so it costs nothing and
 * does not raise the price of later advancements. It is independent of
 * `source`, which keeps saying chosen/random/advancement as the source
 * system reported. PlayerSkillsService sets it for a skill the entry flags
 * (TP's `isExtra`), for a skill one of the player's own trophy awards
 * grants, and for every non-`starting` Hatred (BB2025 grants Hatred only on
 * top of a player's advancements; a player may hate several keywords, one
 * row each). It is only ever set, never cleared, by application code.
 */
const playerSkillsTable = historyTrackedTable({
  schema: gameData,
  name: 'player_skills',
  columns: {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .references(() => players.id)
      .notNull(),
    skillId: integer('skill_id')
      .references(() => skills.id)
      .notNull(),
    source: playerSkillSourceEnum('source').notNull(),
    attributeValue: text('attribute_value'),
    advancementOrder: integer('advancement_order'),
    isFreeExtra: boolean('is_free_extra').notNull().default(false),
  },
  extraConfig: (t) => ({
    // `.nullsNotDistinct()` because Postgres's default treats each NULL as
    // distinct in a unique constraint, which would silently allow two
    // identical no-variant duplicates of the same skill for one player. With
    // it, the constraint holds for variant and non-variant skills alike.
    uniquePlayerSkill: unique(
      'player_skills_player_id_skill_id_attribute_value_unique',
    )
      .on(t.playerId, t.skillId, t.attributeValue)
      .nullsNotDistinct(),
    // A plain single-table check, like `trophies.ts`'s `groupOrLeague`: a
    // starting row has no sequence at all, so it must always leave
    // `advancementOrder` unset, regardless of what application code writes.
    startingHasNoOrder: check(
      'player_skills_starting_has_no_order',
      sql`${t.source} != 'starting' OR ${t.advancementOrder} IS NULL`,
    ),
  }),
});

export const playerSkills = playerSkillsTable.table;
export const playerSkillsHistory = playerSkillsTable.historyTable;

export type PlayerSkill = typeof playerSkills.$inferSelect;
export type NewPlayerSkill = typeof playerSkills.$inferInsert;

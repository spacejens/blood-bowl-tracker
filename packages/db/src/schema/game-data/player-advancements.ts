import {
  PLAYER_CHARACTERISTICS,
  PLAYER_SKILL_SOURCES,
} from '@blood-bowl-tracker/domain-enums';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  serial,
  text,
  uniqueIndex,
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
export const playerAdvancementSourceEnum = gameData.enum(
  'player_advancement_source',
  PLAYER_SKILL_SOURCES,
);

export const playerCharacteristicEnum = gameData.enum(
  'player_characteristic',
  PLAYER_CHARACTERISTICS,
);

/**
 * Every advancement-relevant row one player has, starting skills included,
 * tagged with how they came by it.
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
 * `advancementOrder` is by default a presentation-order proxy (BBL's ordered
 * advancement list, TP's array position), not a verified sequence; it is the
 * real sequence only where `orderConfirmed` says so (see below). It is only
 * ever meaningful for a gained row (`advancement`, `chosen` or `random`) or a
 * characteristic row — a `starting` row always leaves it null, since a
 * starting skill set has no sequence.
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
 * A characteristic row (source `characteristic`) names a `characteristic` and
 * carries no skill, no variant and is never a free extra. `advancementOrder`
 * is one numbering shared by skills and characteristic increases, null meaning
 * unknown. `orderConfirmed` says that order is the real sequence: only
 * confirmed entries are pinned by the cost model, and an unconfirmed order
 * never overwrites a confirmed one. `removed` flags a characteristic row the
 * source no longer reports, because tracked rows cannot be deleted; every
 * reader filters it out.
 *
 * `isFreeExtra` marks a gained skill the player has without having spent SPP
 * on it and that is not one of their advancements, so it costs nothing and
 * does not raise the price of later advancements. It is independent of
 * `source`, which keeps saying chosen/random/advancement as the source
 * system reported. PlayerSkillsService sets it for a skill the entry flags
 * (TP's `isExtra`), for a skill one of the player's own trophy awards
 * grants, and for every non-`starting` Hatred (BB2025 grants Hatred only on
 * top of a player's advancements; a player may hate several keywords, one
 * row each). `sync` and a new trophy award only ever set it; changing or
 * clearing an award's granted skill unmarks that skill's rows for the winner,
 * unless it is Hatred or another award of the same player still grants it.
 */
const playerAdvancementsTable = historyTrackedTable({
  schema: gameData,
  name: 'player_advancements',
  columns: {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .references(() => players.id)
      .notNull(),
    skillId: integer('skill_id').references(() => skills.id),
    characteristic: playerCharacteristicEnum('characteristic'),
    source: playerAdvancementSourceEnum('source').notNull(),
    attributeValue: text('attribute_value'),
    advancementOrder: integer('advancement_order'),
    orderConfirmed: boolean('order_confirmed').notNull().default(false),
    isFreeExtra: boolean('is_free_extra').notNull().default(false),
    removed: boolean('removed').notNull().default(false),
  },
  extraConfig: (t) => ({
    // Two partial indexes instead of one UNIQUE NULLS NOT DISTINCT: a player
    // can raise the same characteristic more than once, and those rows all
    // have a null skill and variant, so uniqueness covers skill rows only.
    // Splitting on the variant keeps two no-variant rows of one skill equal,
    // which plain NULL semantics would not.
    skillWithAttributeUnique: uniqueIndex(
      'player_advancements_skill_with_attribute_unique',
    )
      .on(t.playerId, t.skillId, t.attributeValue)
      .where(sql`${t.skillId} IS NOT NULL AND ${t.attributeValue} IS NOT NULL`),
    skillWithoutAttributeUnique: uniqueIndex(
      'player_advancements_skill_without_attribute_unique',
    )
      .on(t.playerId, t.skillId)
      .where(sql`${t.skillId} IS NOT NULL AND ${t.attributeValue} IS NULL`),
    // A plain single-table check, like `trophies.ts`'s `groupOrLeague`: a
    // starting row has no sequence at all, so it must always leave
    // `advancementOrder` unset, regardless of what application code writes.
    startingHasNoOrder: check(
      'player_advancements_starting_has_no_order',
      sql`${t.source} != 'starting' OR ${t.advancementOrder} IS NULL`,
    ),
    skillOrCharacteristic: check(
      'player_advancements_skill_or_characteristic',
      sql`(${t.source} = 'characteristic' AND ${t.characteristic} IS NOT NULL AND ${t.skillId} IS NULL) OR (${t.source} <> 'characteristic' AND ${t.characteristic} IS NULL AND ${t.skillId} IS NOT NULL)`,
    ),
    characteristicHasNoSkillFields: check(
      'player_advancements_characteristic_has_no_skill_fields',
      sql`${t.source} <> 'characteristic' OR (${t.attributeValue} IS NULL AND ${t.isFreeExtra} = false)`,
    ),
    confirmedHasOrder: check(
      'player_advancements_confirmed_has_order',
      sql`${t.orderConfirmed} = false OR ${t.advancementOrder} IS NOT NULL`,
    ),
    onlyCharacteristicRemoved: check(
      'player_advancements_only_characteristic_removed',
      sql`${t.removed} = false OR ${t.source} = 'characteristic'`,
    ),
  }),
});

export const playerAdvancements = playerAdvancementsTable.table;
export const playerAdvancementsHistory = playerAdvancementsTable.historyTable;

export type PlayerAdvancement = typeof playerAdvancements.$inferSelect;
export type NewPlayerAdvancement = typeof playerAdvancements.$inferInsert;

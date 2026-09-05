import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

/**
 * How one of a position's characteristics is expressed under a rules set:
 * `absent` (the rules set has no such characteristic — only ever Passing, in
 * the pre-BB2020 rules sets), `bare` (a plain number), `plus` (a trailing
 * "+", the value being a target a die roll has to meet) or `plus_zero_legal`
 * (the same target-number display, except a stored 0 is itself legal and
 * means "structurally incapable", rendered as a bare `0` rather than `0+`).
 *
 * `plus_zero_legal` is its own value rather than a per-characteristic flag
 * because Agility and Armour also use `plus` under BB2020/DB2021/BB2025 and 0
 * is never legal for them, so only the format value can say whether 0 is
 * meaningful.
 *
 * `absent` is only usable in practice for Passing today: `move`/`strength`/
 * `agility`/`armour` are non-nullable on `PositionRulesSetEntrySchema`, so
 * configuring one of their formats as `absent` would make every entry for
 * that rules set permanently rejected by `PositionRulesSetsService`. The enum
 * stays uniform across all five columns rather than special-casing Passing.
 *
 * The contract-side mirror of the db's `characteristic_format` enum; the two
 * are held together by packages/game-data/src/shared/enum-sync.spec.ts.
 */
export const CharacteristicFormatSchema = z.enum([
  'absent',
  'bare',
  'plus',
  'plus_zero_legal',
]);

export const RulesSetSchema = z.object({
  id: z.number(),
  name: z.string(),
  // Required, not optional: every rules set that exists has declared all five,
  // because the columns are NOT NULL with defaults.
  moveFormat: CharacteristicFormatSchema,
  strengthFormat: CharacteristicFormatSchema,
  agilityFormat: CharacteristicFormatSchema,
  passingFormat: CharacteristicFormatSchema,
  armourFormat: CharacteristicFormatSchema,
  createdAt: z.coerce.date(),
});

export const UpsertRulesSetSchema = z.object({
  name: z.string().min(1).optional(),
  // Optional for the same reason `name` is: the upsert overlays only what an
  // entry supplies, so an importer that says nothing about characteristics
  // leaves the stored configuration untouched.
  moveFormat: CharacteristicFormatSchema.optional(),
  strengthFormat: CharacteristicFormatSchema.optional(),
  agilityFormat: CharacteristicFormatSchema.optional(),
  passingFormat: CharacteristicFormatSchema.optional(),
  armourFormat: CharacteristicFormatSchema.optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type CharacteristicFormat = z.infer<typeof CharacteristicFormatSchema>;
export type RulesSet = z.infer<typeof RulesSetSchema>;
export type UpsertRulesSet = z.infer<typeof UpsertRulesSetSchema>;

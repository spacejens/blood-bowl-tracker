import { CHARACTERISTIC_FORMATS } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

/**
 * See `CHARACTERISTIC_FORMATS` in `@blood-bowl-tracker/domain-enums` for what
 * each format means and why `plus_zero_legal` is its own value.
 */
export const CharacteristicFormatSchema = z.enum(CHARACTERISTIC_FORMATS);

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

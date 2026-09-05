import { nonBlankStringSchema } from '@blood-bowl-tracker/import';
import { z } from 'zod';

const NOT_AN_OBJECT = 'must be an object.';
const NOT_AN_ARRAY = 'must be an array of mercenary characteristics entries.';
const NOT_A_POSITIVE_INTEGER = 'must be a positive whole number.';
const NOT_A_NONNEGATIVE_INTEGER = 'must be a whole number, zero or greater.';

/**
 * Move, Strength, Agility and Armour: 0 is not a legal value under any rules
 * set (see the `players` table's own DEFAULT 0 doc comment), so this schema
 * enforces a positive whole number rather than accepting any number.
 */
const positiveIntegerSchema = z
  .number({ error: NOT_A_POSITIVE_INTEGER })
  .int(NOT_A_POSITIVE_INTEGER)
  .min(1, NOT_A_POSITIVE_INTEGER);

/**
 * Passing: unlike the other four characteristics, 0 is a legitimate value --
 * a structurally-unable-to-pass mercenary -- so this only rejects negative or
 * fractional values, not zero.
 */
const nonNegativeIntegerSchema = z
  .number({ error: NOT_A_NONNEGATIVE_INTEGER })
  .int(NOT_A_NONNEGATIVE_INTEGER)
  .min(0, NOT_A_NONNEGATIVE_INTEGER);

/**
 * One entry of the top-level `mercenaryCharacteristics` setting in
 * import-tp-config.json5: one mercenary ("Big Guy") position's
 * characteristics under one rules set. TP supplies no characteristics for a
 * mercenary hire anywhere -- not in a roster catalog, not on the
 * match-embedded hire itself -- so this is curated, config-supplied data; see
 * `MercenaryCharacteristicsConfigService`. Messages carry only the tail --
 * `ConfigErrorMessageService` prepends the `MERCENARY_CHARACTERISTICS[i]`
 * location.
 */
export const mercenaryCharacteristicsEntrySchema = z.object(
  {
    positionName: nonBlankStringSchema,
    rulesSetName: nonBlankStringSchema,
    move: positiveIntegerSchema,
    strength: positiveIntegerSchema,
    agility: positiveIntegerSchema,
    passing: nonNegativeIntegerSchema,
    armour: positiveIntegerSchema,
  },
  { error: NOT_AN_OBJECT },
);

/**
 * The `mercenaryCharacteristics` array as
 * `MercenaryCharacteristicsConfigService` reads it: a (possibly empty) array,
 * whose elements are parsed one at a time by `mercenaryCharacteristicsEntrySchema`
 * so each error can name `MERCENARY_CHARACTERISTICS[i]` rather than a path
 * through this array. Unlike `league.eras`, an empty or entirely absent
 * setting is valid -- it just means no mercenary hire has been curated yet,
 * which the config-reading service turns into an empty lookup table rather
 * than an error.
 */
export const mercenaryCharacteristicsShellSchema = z.array(z.unknown(), {
  error: NOT_AN_ARRAY,
});

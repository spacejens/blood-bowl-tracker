import { nonBlankStringSchema } from '@blood-bowl-tracker/import';
import { z } from 'zod';

const NOT_AN_OBJECT = 'must be an object.';
const NOT_AN_ARRAY = 'must be an array of mercenary characteristics entries.';
const NOT_A_NUMBER = 'must be a number.';

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
    move: z.number({ error: NOT_A_NUMBER }),
    strength: z.number({ error: NOT_A_NUMBER }),
    agility: z.number({ error: NOT_A_NUMBER }),
    passing: z.number({ error: NOT_A_NUMBER }),
    armour: z.number({ error: NOT_A_NUMBER }),
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

import {
  isoDateSchema,
  nonBlankStringSchema,
  optionalIsoDateSchema,
  rulesSetsSchema,
} from '@blood-bowl-tracker/import';
import { z } from 'zod';

const NOT_AN_OBJECT = 'must be an object.';
const NOT_A_NON_EMPTY_ERAS_ARRAY = 'must be a non-empty array of eras.';

/**
 * One entry of `league.eras`. Rule sets and dates are not present in TP's
 * data, so they are config-supplied; `dataSubdir` names the directory the
 * era's downloaded files live in. Messages carry only the tail —
 * ConfigErrorMessageService prepends the `TP_ERAS[i]` location.
 */
export const eraDataConfigSchema = z.object(
  {
    identity: z.object(
      { name: nonBlankStringSchema, rulesSets: rulesSetsSchema },
      { error: NOT_AN_OBJECT },
    ),
    dates: z.object(
      { startDate: isoDateSchema, endDate: optionalIsoDateSchema },
      { error: NOT_AN_OBJECT },
    ),
    dataSubdir: nonBlankStringSchema,
  },
  { error: NOT_AN_OBJECT },
);

/**
 * The `league.eras` array as EraDataConfigService reads it: a non-empty
 * array, whose elements are parsed one at a time by `eraDataConfigSchema` so
 * each error can name `TP_ERAS[i]` rather than a path through this array.
 */
export const eraDataShellSchema = z
  .array(z.unknown(), { error: NOT_A_NON_EMPTY_ERAS_ARRAY })
  .min(1, NOT_A_NON_EMPTY_ERAS_ARRAY);

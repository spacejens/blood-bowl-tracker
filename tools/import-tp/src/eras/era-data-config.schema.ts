import {
  isoDateSchema,
  optionalIsoDateSchema,
} from '@blood-bowl-tracker/import';
import { z } from 'zod';

const NOT_AN_OBJECT = 'must be an object.';
const NOT_A_NON_EMPTY_STRING = 'must be a non-empty string.';

/** Module-local schema builder — data assembly, not application logic. */
const nonEmptyString = z
  .string({ error: NOT_A_NON_EMPTY_STRING })
  .refine((value) => value.trim() !== '', NOT_A_NON_EMPTY_STRING);

/**
 * One entry of `league.eras`. Rule sets and dates are not present in TP's
 * data, so they are config-supplied; `dataSubdir` names the directory the
 * era's downloaded files live in. Messages carry only the tail —
 * ConfigErrorMessageService prepends the `TP_ERAS[i]` location.
 */
export const eraDataConfigSchema = z.object(
  {
    identity: z.object(
      {
        name: nonEmptyString,
        rulesSets: z.custom<string[]>(
          (value) =>
            Array.isArray(value) &&
            value.length > 0 &&
            value.every(
              (entry) => typeof entry === 'string' && entry.trim() !== '',
            ),
          'must be a non-empty array of non-empty strings.',
        ),
      },
      { error: NOT_AN_OBJECT },
    ),
    dates: z.object(
      { startDate: isoDateSchema, endDate: optionalIsoDateSchema },
      { error: NOT_AN_OBJECT },
    ),
    dataSubdir: nonEmptyString,
  },
  { error: NOT_AN_OBJECT },
);

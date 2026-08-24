import { z } from 'zod';

const NOT_AN_ARRAY = 'must be a non-empty array of leagues.';
const NOT_AN_OBJECT = 'must be an object.';
const NOT_A_NON_EMPTY_STRING = 'must be a non-empty string.';

/**
 * The `leagues[]` array as LeagueConfigService reads it: only `leagueName`
 * matters here, so every other key (notably `eras`, which EraConfigService
 * owns) is ignored rather than rejected. Messages carry only the tail —
 * ConfigErrorMessageService prepends the `leagues[i].field` location.
 */
export const leagueEntriesSchema = z
  .array(
    z.object(
      {
        leagueName: z
          .string({ error: NOT_A_NON_EMPTY_STRING })
          .refine((value) => value.trim() !== '', NOT_A_NON_EMPTY_STRING),
      },
      { error: NOT_AN_OBJECT },
    ),
    { error: NOT_AN_ARRAY },
  )
  .min(1, NOT_AN_ARRAY);

import { MATCH_CATEGORIES } from '@blood-bowl-tracker/api-contract';
import { nonBlankStringSchema } from '@blood-bowl-tracker/import';
import { z } from 'zod';

/** The literal `winnerTeamCode` value meaning "this match was a draw". */
export const DRAW = 'draw';

const NOT_A_TEAM_CODE = `must be a non-empty string: a BBL team code, or "${DRAW}".`;

/**
 * One `matches.merges` entry: exactly two non-empty match ids. Both checks
 * report at the root, so MatchMergeConfigService can prefix them with the
 * entry's own `BBL_ERAS[i].matches.merges[j]` location.
 */
export const matchMergePairSchema = z
  .custom<[string, string]>(
    (value) => Array.isArray(value) && value.length === 2,
    'must be a 2-element array of match ids.',
  )
  .refine(
    (value) => value.every((id) => typeof id === 'string' && id.trim() !== ''),
    'must contain two non-empty string match ids.',
  );

/** One `matches.categoryOverrides` entry. */
export const matchCategoryOverrideSchema = z.object(
  {
    matchId: nonBlankStringSchema,
    category: z.enum(MATCH_CATEGORIES, {
      error: `must be one of: ${MATCH_CATEGORIES.join(', ')}.`,
    }),
  },
  { error: 'must be an object of the form { matchId, category }.' },
);

/** One `matches.resultOverrides` entry. */
export const matchResultOverrideSchema = z.object(
  {
    matchId: nonBlankStringSchema,
    winnerTeamCode: z
      .string({ error: NOT_A_TEAM_CODE })
      .refine((value) => value.trim() !== '', NOT_A_TEAM_CODE),
  },
  { error: 'must be an object of the form { matchId, winnerTeamCode }.' },
);

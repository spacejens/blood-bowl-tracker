import {
  isoDateSchema,
  optionalIsoDateSchema,
} from '@blood-bowl-tracker/import';
import { z } from 'zod';

const NOT_AN_OBJECT = 'must be an object.';
const NOT_A_NON_EMPTY_STRING = 'must be a non-empty string.';
const NOT_A_BOOLEAN = 'must be a boolean.';
const NOT_A_STRING_LIST = 'must be a non-empty array of non-empty strings.';
const NOT_A_POSITIVE_INTEGER = 'must be a positive integer.';

/**
 * Module-local schema builder — data assembly, not application logic.
 * A string with at least one non-whitespace character, keeping the original
 * (untrimmed) value.
 */
const nonEmptyString = z
  .string({ error: NOT_A_NON_EMPTY_STRING })
  .refine((value) => value.trim() !== '', NOT_A_NON_EMPTY_STRING);

const identitySchema = z.object(
  {
    name: nonEmptyString,
    // One issue for the whole field, so the message stays the single
    // sentence the config file's author needs to read.
    rulesSets: z.custom<string[]>(
      (value) =>
        Array.isArray(value) &&
        value.length > 0 &&
        value.every(
          (entry) => typeof entry === 'string' && entry.trim() !== '',
        ),
      NOT_A_STRING_LIST,
    ),
  },
  { error: NOT_AN_OBJECT },
);

const datesSchema = z.object(
  {
    startDate: isoDateSchema,
    endDate: optionalIsoDateSchema,
    autoAssignByDate: z.boolean({ error: NOT_A_BOOLEAN }),
  },
  { error: NOT_AN_OBJECT },
);

/**
 * `autoAssignByPlayerId` is declared first so a bad flag is the issue
 * reported when several player fields are wrong at once — zod reports object
 * issues in key-declaration order.
 */
const playersSchema = z
  .object(
    {
      autoAssignByPlayerId: z.boolean({ error: NOT_A_BOOLEAN }),
      firstPlayerId: z
        .number({ error: NOT_A_POSITIVE_INTEGER })
        .int(NOT_A_POSITIVE_INTEGER)
        .positive(NOT_A_POSITIVE_INTEGER)
        .optional(),
      lastPlayerId: z
        .number({ error: NOT_A_POSITIVE_INTEGER })
        .int(NOT_A_POSITIVE_INTEGER)
        .positive(NOT_A_POSITIVE_INTEGER)
        .optional(),
      playerIdOverrides: z
        .custom<number[]>(
          (value) =>
            Array.isArray(value) &&
            value.every(
              (entry) =>
                typeof entry === 'number' &&
                Number.isInteger(entry) &&
                entry > 0,
            ),
          'must be an array of positive integers when present.',
        )
        .optional(),
    },
    { error: NOT_AN_OBJECT },
  )
  .superRefine((value, ctx) => {
    if (value.autoAssignByPlayerId && value.firstPlayerId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['firstPlayerId'],
        message: NOT_A_POSITIVE_INTEGER,
      });
    }
    if (value.lastPlayerId !== undefined && value.firstPlayerId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['lastPlayerId'],
        message: 'requires firstPlayerId to be set.',
      });
    }
    if (
      value.firstPlayerId !== undefined &&
      value.lastPlayerId !== undefined &&
      value.firstPlayerId > value.lastPlayerId
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['firstPlayerId'],
        message: 'must be less than or equal to lastPlayerId.',
      });
    }
  });

const competitionOverrideSchema = z
  .object(
    {
      bblId: nonEmptyString,
      type: z.enum(['season', 'cup'], { error: 'must be "season" or "cup".' }),
      startDate: optionalIsoDateSchema,
      endDate: optionalIsoDateSchema,
    },
    {
      error:
        'must be an object with bblId, type, and optional startDate/endDate.',
    },
  )
  .superRefine((value, ctx) => {
    if (value.endDate !== undefined && value.startDate === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'requires startDate to also be set.',
      });
    }
    if (
      value.startDate !== undefined &&
      value.endDate !== undefined &&
      value.endDate < value.startDate
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'must not be before startDate.',
      });
    }
  });

const competitionsSchema = z
  .object(
    {
      overrides: z
        .array(competitionOverrideSchema, {
          error: 'must be an array of override objects.',
        })
        .optional(),
    },
    { error: NOT_AN_OBJECT },
  )
  .optional();

const teamsSchema = z
  .object(
    {
      teamCodeOverrides: z
        .custom<string[]>(
          (value) =>
            Array.isArray(value) &&
            value.every(
              (entry) => typeof entry === 'string' && entry.trim() !== '',
            ),
          'must be an array of non-empty strings when present.',
        )
        .optional(),
    },
    { error: NOT_AN_OBJECT },
  )
  .optional();

/**
 * The three matches lists are carried through unvalidated: their per-entry
 * shape and cross-era uniqueness belong to MatchMergeConfigService,
 * MatchCategoryConfigService and MatchResultConfigService, which flatten
 * them across every era.
 */
const matchesSchema = z
  .object(
    {
      merges: z
        .array(z.unknown(), { error: 'must be an array of [id, id] pairs.' })
        .optional(),
      categoryOverrides: z
        .array(z.unknown(), {
          error: 'must be an array of { matchId, category } entries.',
        })
        .optional(),
      resultOverrides: z
        .array(z.unknown(), {
          error: 'must be an array of { matchId, winnerTeamCode } entries.',
        })
        .optional(),
    },
    { error: NOT_AN_OBJECT },
  )
  .optional();

const positionsSchema = z
  .array(
    z.object(
      {
        positionId: nonEmptyString,
        raceId: nonEmptyString,
        available: z.boolean({ error: NOT_A_BOOLEAN }),
      },
      { error: NOT_AN_OBJECT },
    ),
    { error: 'must be an array.' },
  )
  .optional();

/** One era, as it appears inside a `leagues[].eras` array. */
export const eraConfigSchema = z.object(
  {
    identity: identitySchema,
    dates: datesSchema,
    players: playersSchema,
    competitions: competitionsSchema,
    teams: teamsSchema,
    matches: matchesSchema,
    positions: positionsSchema,
  },
  { error: NOT_AN_OBJECT },
);

/**
 * The `leagues[]` array as EraConfigService reads it: each entry's `eras`
 * must be a non-empty array, but its elements are parsed one at a time by
 * `eraConfigSchema` so each error can name `BBL_ERAS[i]` rather than a path
 * through the leagues array.
 */
export const leaguesShellSchema = z
  .array(
    z.object(
      {
        leagueName: nonEmptyString,
        eras: z
          .array(z.unknown(), { error: 'must be a non-empty array of eras.' })
          .min(1, 'must be a non-empty array of eras.'),
      },
      { error: NOT_AN_OBJECT },
    ),
    { error: 'must be a non-empty array of leagues.' },
  )
  .min(1, 'must be a non-empty array of leagues.');

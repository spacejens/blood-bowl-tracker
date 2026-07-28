import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

/**
 * Every match category, in the same order as `game_data.match_category`
 * (packages/db). Exported as a tuple so consumers can iterate the values as
 * well as use the inferred union type.
 */
export const MATCH_CATEGORIES = [
  'normal',
  'cup_final',
  'season_semi_final',
  'season_final',
  'season_bronze',
  'season_qualifier',
] as const;

export type MatchCategory = (typeof MATCH_CATEGORIES)[number];

export const MatchSchema = z.object({
  id: z.number(),
  competitionId: z.number(),
  teamEraIds: z.array(z.number()),
  name: z.string(),
  category: z.enum(MATCH_CATEGORIES),
  playedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export const UpsertMatchSchema = z.object({
  competitionId: z.number().int().optional(),
  playedAt: z.date().optional(),
  name: z.string().min(1).optional(),
  category: z.enum(MATCH_CATEGORIES).optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
  teamEraIds: z.array(z.number().int()).default([]),
});

export type Match = z.infer<typeof MatchSchema>;
export type UpsertMatch = z.infer<typeof UpsertMatchSchema>;

/**
 * One source-supplied outcome signal for a single match. `winnerTeamEraId`
 * names the winning participant's team era; `null` means the source says the
 * match was a draw (distinct from supplying no hint for the match at all).
 */
export const MatchOutcomeHintSchema = z.object({
  matchId: z.number().int(),
  winnerTeamEraId: z.number().int().nullable(),
});

/**
 * Resolve every match outcome in one competition. Runs as an importer's last
 * step, after that competition's matches, match teams and match events are
 * all imported: scores are counted from `touchdown` events, and winners are
 * derived from those scores, the match category, bracket progression across
 * the competition's other matches, and these two hint lists.
 *
 * - `overrides` always win, whatever the scores say (developer-configured
 *   corrections).
 * - `tieBreaks` are consulted only when the scores are tied and the category
 *   forbids a draw (BBL's `sr` trophy placements, TP's `scoreResume.winner`).
 */
export const ResolveMatchOutcomesSchema = z.object({
  competitionId: z.number().int(),
  overrides: z.array(MatchOutcomeHintSchema).default([]),
  tieBreaks: z.array(MatchOutcomeHintSchema).default([]),
});

/**
 * `unresolvedMatchIds` lists matches whose outcome could not be determined
 * from any signal. Their `winning_match_team_id` is left untouched (so a
 * guessed draw is never written) and the caller is expected to report each
 * one as an import error.
 */
export const ResolveMatchOutcomesResultSchema = z.object({
  competitionId: z.number(),
  resolvedMatchIds: z.array(z.number()),
  unresolvedMatchIds: z.array(z.number()),
});

export type MatchOutcomeHint = z.infer<typeof MatchOutcomeHintSchema>;
export type ResolveMatchOutcomes = z.infer<typeof ResolveMatchOutcomesSchema>;
export type ResolveMatchOutcomesResult = z.infer<
  typeof ResolveMatchOutcomesResultSchema
>;

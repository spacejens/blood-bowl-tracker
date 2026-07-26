import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

export const ActionTypeSchema = z.enum([
  'touchdown',
  'completion',
  'interception',
  'deflection',
  'foul',
  'mvp_award',
  'casualty',
  'badly_hurt',
  'serious_injury',
  'death',
  'inducements',
  'winnings',
  'fan_factor',
  'journeymen_signings',
  'prayers_to_nuffle',
  'secret_objective',
  'successful_landing',
]);

export const ConsequenceTypeSchema = z.enum([
  'casualty',
  'badly_hurt',
  'serious_injury',
  'miss_next_game',
  'niggling_injury',
  'stat_reduction_ma',
  'stat_reduction_st',
  'stat_reduction_ag',
  'stat_reduction_av',
  'stat_reduction_pa',
  'death',
  'sent_off',
  'expensive_mistake',
  'concession',
  'dedicated_fans',
]);

/**
 * Top-level classification for match events that have no actor and no
 * consequence recipient (e.g. a weather roll) — parallel to `actionType`/
 * `consequenceType`, mutually exclusive with both.
 */
export const EventTypeSchema = z.enum(['weather']);

/**
 * The named weather condition a decoded `weather`-classified event carries.
 * Mirrors the `game_data.weather_type` enum; `'unknown'` is a permanent
 * catch-all for codes not yet mapped.
 */
export const WeatherTypeSchema = z.enum([
  'dungeon',
  'sweltering_heat',
  'very_sunny',
  'nice',
  'pouring_rain',
  'blizzard',
  'morning_dew',
  'blossoming_flowers',
  'misty_morning',
  'high_winds',
  'perfect_conditions',
  'melting_astrogranite',
  'blinding_rays',
  'monsoon',
  'leaf_strewn_pitch',
  'autumnal_chill',
  'strong_winds',
  'cold_winds',
  'freezing',
  'heavy_snow',
  'unknown',
]);

/**
 * The named secret-objective card a decoded `secret_objective` event carries.
 * Mirrors the `game_data.secret_objective` enum; `'unknown'` is a permanent
 * catch-all for codes not yet mapped.
 */
export const SecretObjectiveSchema = z.enum([
  'red_card',
  'didnt_need_them_anyway',
  'going_alone',
  'fouling_frenzy',
  'going_surfing',
  'ganging_up',
  'whoops',
  'not_so_fast',
  'timely_tackle',
  'precision_passing',
  'hit_em_hard',
  'just_a_little_further',
  'go_long',
  'nuffle_favors_the_bold',
  'all_according_to_plan',
  'headtaker',
  'unknown',
]);

export const MatchEventSchema = z.object({
  id: z.number(),
  matchId: z.number(),
  actingMatchTeamId: z.number().nullable(),
  consequenceMatchTeamId: z.number().nullable(),
  actingPlayerId: z.number().nullable(),
  consequencePlayerId: z.number().nullable(),
  actionType: ActionTypeSchema.nullable(),
  consequenceType: ConsequenceTypeSchema.nullable(),
  createdAt: z.coerce.date(),
});

/** True for both "not supplied" and "explicitly cleared". */
const absent = (value: unknown): boolean =>
  value === undefined || value === null;

export const UpsertMatchEventSchema = z
  .object({
    // Required, unlike every other upsert field: matchId is not row data being
    // overlaid — the service loads the match's match_teams by it in order to
    // translate actingTeamEraId/consequenceTeamEraId into match_team ids
    // before the upsert runs. Like externalIds, it addresses the operation.
    matchId: z.number().int(),
    // Resolution inputs rather than column values (they become
    // actingMatchTeamId/consequenceMatchTeamId), so optional but not nullable.
    actingTeamEraId: z.number().int().optional(),
    consequenceTeamEraId: z.number().int().optional(),
    // Every field below maps 1:1 onto a nullable match_events column, so all
    // three states are expressible: a value writes it, null clears it,
    // omission leaves the stored value alone (issue #174).
    actingPlayerId: z.number().int().nullable().optional(),
    consequencePlayerId: z.number().int().nullable().optional(),
    actionType: ActionTypeSchema.nullable().optional(),
    consequenceType: ConsequenceTypeSchema.nullable().optional(),
    eventType: EventTypeSchema.nullable().optional(),
    weatherType: WeatherTypeSchema.nullable().optional(),
    inducementsCost: z.number().int().nullable().optional(),
    inducementsFromTreasury: z.number().int().nullable().optional(),
    winnings: z.number().int().nullable().optional(),
    fanFactor: z.number().int().nullable().optional(),
    journeymenCount: z.number().int().nullable().optional(),
    prayersToNuffle: z.number().int().nullable().optional(),
    dedicatedFans: z.number().int().nullable().optional(),
    /**
     * TP's own opaque identifier code for which specific secret-objective
     * card was drawn — not a count of objectives completed. The same
     * roster can have multiple `secret_objective` events in one match with
     * different, non-sequential values, and the same value can recur
     * across different matches for different rosters.
     */
    secretObjective: SecretObjectiveSchema.nullable().optional(),
    expensiveMistake: z.number().int().nullable().optional(),
    externalIds: z.array(ExternalIdSchema).min(1),
  })
  .refine(
    (v) =>
      // `absent` treats null like undefined here: the classification triple is
      // about which KIND of event this is, and "clear it to null" is not a
      // meaningful third state to validate against.
      (!absent(v.eventType) &&
        absent(v.actionType) &&
        absent(v.consequenceType)) ||
      (absent(v.eventType) &&
        (!absent(v.actionType) || !absent(v.consequenceType))),
    {
      message:
        'Event must have eventType alone, or at least one of actionType/consequenceType (mutually exclusive with eventType)',
    },
  );

export type ActionType = z.infer<typeof ActionTypeSchema>;
export type ConsequenceType = z.infer<typeof ConsequenceTypeSchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type WeatherType = z.infer<typeof WeatherTypeSchema>;
export type SecretObjective = z.infer<typeof SecretObjectiveSchema>;
export type MatchEvent = z.infer<typeof MatchEventSchema>;
export type UpsertMatchEvent = z.infer<typeof UpsertMatchEventSchema>;

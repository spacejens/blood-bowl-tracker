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

export const UpsertMatchEventSchema = z
  .object({
    matchId: z.number().int(),
    actingTeamEraId: z.number().int().optional(),
    consequenceTeamEraId: z.number().int().optional(),
    actingPlayerId: z.number().int().optional(),
    consequencePlayerId: z.number().int().optional(),
    actionType: ActionTypeSchema.optional(),
    consequenceType: ConsequenceTypeSchema.optional(),
    eventType: EventTypeSchema.optional(),
    weatherType: WeatherTypeSchema.optional(),
    inducementsCost: z.number().int().optional(),
    inducementsFromTreasury: z.number().int().optional(),
    winnings: z.number().int().optional(),
    fanFactor: z.number().int().optional(),
    journeymenCount: z.number().int().optional(),
    prayersToNuffle: z.number().int().optional(),
    dedicatedFans: z.number().int().optional(),
    /**
     * TP's own opaque identifier code for which specific secret-objective
     * card was drawn — not a count of objectives completed. The same
     * roster can have multiple `secret_objective` events in one match with
     * different, non-sequential values, and the same value can recur
     * across different matches for different rosters.
     */
    secretObjective: SecretObjectiveSchema.optional(),
    expensiveMistake: z.number().int().optional(),
    externalIds: z.array(ExternalIdSchema).min(1),
  })
  .refine(
    (v) =>
      (v.eventType !== undefined &&
        v.actionType === undefined &&
        v.consequenceType === undefined) ||
      (v.eventType === undefined &&
        (v.actionType !== undefined || v.consequenceType !== undefined)),
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

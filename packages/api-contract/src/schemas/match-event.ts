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
  'weather_roll',
  'inducements_roll',
  'winnings_roll',
  'fan_factor_roll',
  'journeyman_signing',
  'prayers_to_nuffle',
  'dedicated_fans_roll',
  'secret_objective',
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
    weatherType: z.number().int().optional(),
    inducementsCost: z.number().int().optional(),
    winnings: z.number().int().optional(),
    fanFactor: z.number().int().optional(),
    journeymenCount: z.number().int().optional(),
    prayersToNuffle: z.number().int().optional(),
    dedicatedFans: z.number().int().optional(),
    secretObjective: z.number().int().optional(),
    expensiveMistake: z.number().int().optional(),
    externalIds: z.array(ExternalIdSchema).min(1),
  })
  .refine(
    (v) => v.actionType !== undefined || v.consequenceType !== undefined,
    { message: 'Event must have an actionType or a consequenceType' },
  );

export type ActionType = z.infer<typeof ActionTypeSchema>;
export type ConsequenceType = z.infer<typeof ConsequenceTypeSchema>;
export type MatchEvent = z.infer<typeof MatchEventSchema>;
export type UpsertMatchEvent = z.infer<typeof UpsertMatchEventSchema>;

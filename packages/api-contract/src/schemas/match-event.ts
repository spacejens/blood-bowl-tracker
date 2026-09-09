import {
  ACTION_TYPES,
  CONSEQUENCE_AVOIDED_BY_VALUES,
  CONSEQUENCE_TYPES,
  EVENT_TYPES,
  SECRET_OBJECTIVES,
  UNIDENTIFIED_PARTICIPANT_KINDS,
  WEATHER_TYPES,
} from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

import { ExternalIdSchema } from './external-id';
import { absent } from './shared/absent';

/**
 * See `ACTION_TYPES` in `@blood-bowl-tracker/domain-enums` for what each value
 * means.
 */
export const ActionTypeSchema = z.enum(ACTION_TYPES);

/**
 * See `CONSEQUENCE_TYPES` in `@blood-bowl-tracker/domain-enums` for what each
 * value means.
 */
export const ConsequenceTypeSchema = z.enum(CONSEQUENCE_TYPES);

/**
 * See `UNIDENTIFIED_PARTICIPANT_KINDS` in `@blood-bowl-tracker/domain-enums`
 * for what each value means.
 */
export const UnidentifiedParticipantKindSchema = z.enum(
  UNIDENTIFIED_PARTICIPANT_KINDS,
);

/**
 * See `CONSEQUENCE_AVOIDED_BY_VALUES` in `@blood-bowl-tracker/domain-enums`
 * for what each value means.
 */
export const ConsequenceAvoidedBySchema = z.enum(CONSEQUENCE_AVOIDED_BY_VALUES);

/**
 * See `EVENT_TYPES` in `@blood-bowl-tracker/domain-enums` for what each value
 * means. Mutually exclusive with `actionType`/`consequenceType`, enforced by
 * `UpsertMatchEventSchema`'s refinement below.
 */
export const EventTypeSchema = z.enum(EVENT_TYPES);

/**
 * See `WEATHER_TYPES` in `@blood-bowl-tracker/domain-enums` for what each
 * value means.
 */
export const WeatherTypeSchema = z.enum(WEATHER_TYPES);

/**
 * See `SECRET_OBJECTIVES` in `@blood-bowl-tracker/domain-enums` for what each
 * value means.
 */
export const SecretObjectiveSchema = z.enum(SECRET_OBJECTIVES);

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
    // omission leaves the stored value alone.
    actingPlayerId: z.number().int().nullable().optional(),
    consequencePlayerId: z.number().int().nullable().optional(),
    actionType: ActionTypeSchema.nullable().optional(),
    consequenceType: ConsequenceTypeSchema.nullable().optional(),
    /**
     * Set when the acting participant was not an indexed player: what the
     * source says it was. Independent of `actingPlayerId`, which stays null
     * for such an occurrence.
     */
    actingUnidentifiedKind:
      UnidentifiedParticipantKindSchema.nullable().optional(),
    /** Same, for the consequence recipient. */
    consequenceUnidentifiedKind:
      UnidentifiedParticipantKindSchema.nullable().optional(),
    /** Only set together with `consequenceType: 'casualty_avoided'`. */
    consequenceAvoidedBy: ConsequenceAvoidedBySchema.nullable().optional(),
    /**
     * Which severity was prevented. Reuses `ConsequenceTypeSchema` because
     * every severity it needs is already a value there.
     */
    consequenceAvoidedSeverity: ConsequenceTypeSchema.nullable().optional(),
    eventType: EventTypeSchema.nullable().optional(),
    weatherType: WeatherTypeSchema.nullable().optional(),
    inducementsCost: z.number().int().nullable().optional(),
    inducementsFromTreasury: z.number().int().nullable().optional(),
    winnings: z.number().int().nullable().optional(),
    /**
     * The per-side fan factor for the match, not a delta from a prior
     * value.
     */
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
    /**
     * Star Player Points this event awarded its acting player. A column
     * value, so all three states are expressible: a number writes it, null
     * clears it, omission leaves the stored value alone. The TP importer
     * supplies TP's own reported figure here; the BBL importer supplies
     * nothing and sets `computeSppValue` instead.
     */
    sppValue: z.number().int().nullable().optional(),
    /**
     * A resolution input rather than a column value — like `matchId` and
     * `actingTeamEraId` above, it addresses the operation instead of being
     * row data. `true` asks the server to resolve `sppValue` from
     * `spp_award_values` (by the acting player's era rules set and team
     * race) for SPP-earning action types, and to leave it null otherwise.
     * An explicitly supplied `sppValue` always wins, so a source with its
     * own figure is never overwritten by a recomputation. Sources with no
     * SPP data of their own (BBL) set this; sources with their own figure
     * (TP) never do.
     */
    computeSppValue: z.boolean().optional(),
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
export type UnidentifiedParticipantKind = z.infer<
  typeof UnidentifiedParticipantKindSchema
>;
export type ConsequenceAvoidedBy = z.infer<typeof ConsequenceAvoidedBySchema>;
export type EventType = z.infer<typeof EventTypeSchema>;
export type WeatherType = z.infer<typeof WeatherTypeSchema>;
export type SecretObjective = z.infer<typeof SecretObjectiveSchema>;
export type MatchEvent = z.infer<typeof MatchEventSchema>;
export type UpsertMatchEvent = z.infer<typeof UpsertMatchEventSchema>;

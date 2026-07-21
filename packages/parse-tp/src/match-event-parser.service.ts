import { z } from 'zod';

/**
 * The set of injury outcomes TP's `matchEvents[].injuryType` field can carry
 * for a code-8 (injury) event.
 */
export type TpInjuryType =
  | 'None'
  | 'MissNextGame'
  | 'NigglingInjury'
  | 'Dead'
  | 'AV'
  | 'ST'
  | 'MA'
  | 'PA'
  | 'AG';

/** A star player induced via a code-11 (inducements_roll) event. */
export interface TpInducedStarPlayer {
  name: string;
  lineUpMasterId: number;
  number: number;
}

interface TpMatchEventBase {
  /** `matchEvents[].id` — used for external-id synthesis by the import step. */
  tpEventId: number;
  /** `matchEvents[].instant`. */
  instant: string;
}

/**
 * The modeled subset of TP's raw `matchEvents[]` per-roll event log,
 * discriminated by `type` (a stable slug derived from the numeric
 * `matchEventType` code). See `parseMatchEvents` for the full decode table
 * and which codes are dropped.
 */
export type TpMatchEvent =
  | (TpMatchEventBase & {
      type: 'touchdown';
      lineUpId: number;
      rosterId: number;
    })
  | (TpMatchEventBase & {
      type: 'injury';
      lineUpId: number;
      /** Victim team's roster id. */
      rosterId: number;
      /** Acting team's roster id (whose turn it was), when present. */
      turnRosterId?: number;
      injuryType: TpInjuryType;
    })
  | (TpMatchEventBase & { type: 'weather_roll'; weatherType: number })
  | (TpMatchEventBase & {
      type: 'inducements_roll';
      rosterId: number;
      totalCost: number;
      starPlayers: TpInducedStarPlayer[];
      /**
       * The portion of the inducements spend paid out of the team's
       * treasury (as opposed to free stadium/petty-cash allowance).
       * Present with a value of `0` in some events, a non-zero value in
       * others, and entirely absent in many older events.
       */
      fromTreasury?: number;
    })
  | (TpMatchEventBase & {
      type: 'winnings_roll';
      localWinnings: number;
      visitorWinnings: number;
    })
  | (TpMatchEventBase & {
      type: 'fan_factor_roll';
      newFanFactorLocal: number;
      newFanFactorVisitor: number;
    })
  | (TpMatchEventBase & {
      type: 'journeyman_signing';
      rosterId: number;
      journeymenCount: number;
    })
  | (TpMatchEventBase & {
      type: 'expensive_mistake';
      rosterId: number;
      expensiveMistake: number;
    })
  | (TpMatchEventBase & {
      type: 'dedicated_fans_roll';
      dedicatedFansModifierLocal: number;
      dedicatedFansModifierVisitor: number;
    })
  | (TpMatchEventBase & {
      type: 'secret_objective';
      rosterId: number;
      secretObjective: number;
    })
  | (TpMatchEventBase & { type: 'prayers_to_nuffle'; prayersToNuffle: number })
  | (TpMatchEventBase & {
      type: 'concession';
      concedeLocal: boolean;
      concedeVisitor: boolean;
    });

const injuryTypeSchema = z.enum([
  'None',
  'MissNextGame',
  'NigglingInjury',
  'Dead',
  'AV',
  'ST',
  'MA',
  'PA',
  'AG',
]);

const starPlayerRaw = z.object({
  name: z.string(),
  lineUpMasterId: z.number(),
  number: z.number(),
});

// One raw schema per modeled code. Extra fields are dropped by non-strict parse.
const touchdownRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
});
const injuryRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
  turnRosterId: z.number().nullish(),
  injuryType: injuryTypeSchema,
});
const weatherRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({ weatherType: z.number() }),
});
const inducementsRaw = z.object({
  id: z.number(),
  instant: z.string(),
  rosterId: z.number(),
  extraData: z.object({
    totalCost: z.number(),
    starPlayers: z.array(starPlayerRaw),
    fromTreasury: z.number().nullish(),
  }),
});
const winningsRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    localWinnings: z.number(),
    visitorWinnings: z.number(),
  }),
});
const fanFactorRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    newFanFactorLocal: z.number(),
    newFanFactorVisitor: z.number(),
  }),
});
const journeymanSigningRaw = z.object({
  id: z.number(),
  instant: z.string(),
  rosterId: z.number(),
  extraData: z.object({ journeymenCount: z.number() }),
});
const expensiveMistakeRaw = z.object({
  id: z.number(),
  instant: z.string(),
  rosterId: z.number(),
  extraData: z.object({ expensiveMistake: z.number() }),
});
const dedicatedFansRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    dedicatedFansModifierLocal: z.number(),
    dedicatedFansModifierVisitor: z.number(),
  }),
});
const secretObjectiveRaw = z.object({
  id: z.number(),
  instant: z.string(),
  rosterId: z.number(),
  extraData: z.object({ secretObjective: z.number() }),
});
const prayersToNuffleRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({ prayersToNuffle: z.number() }),
});
const concessionRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    concedeLocal: z.boolean(),
    concedeVisitor: z.boolean(),
  }),
});

type Decoder = (raw: unknown) => TpMatchEvent;

function decode<T>(
  schema: z.ZodType<T>,
  code: number,
  map: (v: T) => TpMatchEvent,
): Decoder {
  return (raw) => {
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `Invalid TP match event (code ${code}): ${result.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ')}`,
      );
    }
    return map(result.data);
  };
}

const decoders = new Map<number, Decoder>([
  [
    4,
    decode(touchdownRaw, 4, (v) => ({
      type: 'touchdown',
      tpEventId: v.id,
      instant: v.instant,
      lineUpId: v.lineUpId,
      rosterId: v.rosterId,
    })),
  ],
  [
    8,
    decode(injuryRaw, 8, (v) => ({
      type: 'injury',
      tpEventId: v.id,
      instant: v.instant,
      lineUpId: v.lineUpId,
      rosterId: v.rosterId,
      ...(v.turnRosterId != null ? { turnRosterId: v.turnRosterId } : {}),
      injuryType: v.injuryType,
    })),
  ],
  [
    10,
    decode(weatherRaw, 10, (v) => ({
      type: 'weather_roll',
      tpEventId: v.id,
      instant: v.instant,
      weatherType: v.extraData.weatherType,
    })),
  ],
  [
    11,
    decode(inducementsRaw, 11, (v) => ({
      type: 'inducements_roll',
      tpEventId: v.id,
      instant: v.instant,
      rosterId: v.rosterId,
      totalCost: v.extraData.totalCost,
      starPlayers: v.extraData.starPlayers.map((sp) => ({
        name: sp.name,
        lineUpMasterId: sp.lineUpMasterId,
        number: sp.number,
      })),
      ...(v.extraData.fromTreasury != null
        ? { fromTreasury: v.extraData.fromTreasury }
        : {}),
    })),
  ],
  [
    12,
    decode(winningsRaw, 12, (v) => ({
      type: 'winnings_roll',
      tpEventId: v.id,
      instant: v.instant,
      localWinnings: v.extraData.localWinnings,
      visitorWinnings: v.extraData.visitorWinnings,
    })),
  ],
  [
    13,
    decode(fanFactorRaw, 13, (v) => ({
      type: 'fan_factor_roll',
      tpEventId: v.id,
      instant: v.instant,
      newFanFactorLocal: v.extraData.newFanFactorLocal,
      newFanFactorVisitor: v.extraData.newFanFactorVisitor,
    })),
  ],
  [
    14,
    decode(expensiveMistakeRaw, 14, (v) => ({
      type: 'expensive_mistake',
      tpEventId: v.id,
      instant: v.instant,
      rosterId: v.rosterId,
      expensiveMistake: v.extraData.expensiveMistake,
    })),
  ],
  [
    15,
    decode(journeymanSigningRaw, 15, (v) => ({
      type: 'journeyman_signing',
      tpEventId: v.id,
      instant: v.instant,
      rosterId: v.rosterId,
      journeymenCount: v.extraData.journeymenCount,
    })),
  ],
  [
    20,
    decode(concessionRaw, 20, (v) => ({
      type: 'concession',
      tpEventId: v.id,
      instant: v.instant,
      concedeLocal: v.extraData.concedeLocal,
      concedeVisitor: v.extraData.concedeVisitor,
    })),
  ],
  [
    23,
    decode(prayersToNuffleRaw, 23, (v) => ({
      type: 'prayers_to_nuffle',
      tpEventId: v.id,
      instant: v.instant,
      prayersToNuffle: v.extraData.prayersToNuffle,
    })),
  ],
  [
    26,
    decode(dedicatedFansRaw, 26, (v) => ({
      type: 'dedicated_fans_roll',
      tpEventId: v.id,
      instant: v.instant,
      dedicatedFansModifierLocal: v.extraData.dedicatedFansModifierLocal,
      dedicatedFansModifierVisitor: v.extraData.dedicatedFansModifierVisitor,
    })),
  ],
  [
    42,
    decode(secretObjectiveRaw, 42, (v) => ({
      type: 'secret_objective',
      tpEventId: v.id,
      instant: v.instant,
      rosterId: v.rosterId,
      secretObjective: v.extraData.secretObjective,
    })),
  ],
]);

const topLevelSchema = z.object({ matchEventType: z.number() });

/**
 * Decode a raw TP `matchEvents[]` array into the modeled subset. Structural
 * markers and per-roll noise (codes such as 0, 1, 3, 5, 6, 7, 18, 19, 25, 27,
 * 31, 32, 46 — including code 27, a "player assigned to line-up" structural
 * row, not a modeled roll) and any unrecognized code are silently dropped so
 * new TP codes never crash the import. `None` injuries are still returned;
 * the import step decides whether to skip them, keeping this parser a pure
 * decode. Throws a descriptive `Error` only when a *known* code's payload
 * fails its schema.
 */
export function parseMatchEvents(rawEvents: unknown): TpMatchEvent[] {
  const array = z.array(z.unknown()).safeParse(rawEvents);
  if (!array.success) {
    throw new Error('Invalid TP match events: expected an array.');
  }
  const events: TpMatchEvent[] = [];
  for (const raw of array.data) {
    const head = topLevelSchema.safeParse(raw);
    if (!head.success) {
      continue; // no numeric matchEventType — not a decodable event
    }
    const decoder = decoders.get(head.data.matchEventType);
    if (decoder) {
      events.push(decoder(raw));
    }
  }
  return events;
}

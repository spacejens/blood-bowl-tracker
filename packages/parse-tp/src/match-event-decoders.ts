import { z } from 'zod';

import type { TpMatchEvent } from './match-event-parser.service';

export const injuryTypeSchema = z.enum([
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

export const starPlayerRaw = z.object({
  name: z.string(),
  lineUpMasterId: z.number(),
  number: z.number(),
});

// One raw schema per modeled code. Extra fields are dropped by non-strict parse.
export const touchdownRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
});
export const mvpAwardRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
});
export const injuryRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
  turnRosterId: z.number().nullish(),
  turnNumber: z.number().nullish(),
  injuryType: injuryTypeSchema,
});
export const casualtyCausedRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
  turnNumber: z.number().nullish(),
});
export const weatherRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({ weatherType: z.number() }),
});
export const inducementsRaw = z.object({
  id: z.number(),
  instant: z.string(),
  rosterId: z.number(),
  extraData: z.object({
    totalCost: z.number(),
    starPlayers: z.array(starPlayerRaw),
    fromTreasury: z.number().nullish(),
  }),
});
export const winningsRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    localWinnings: z.number(),
    visitorWinnings: z.number(),
  }),
});
export const fanFactorRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    newFanFactorLocal: z.number(),
    newFanFactorVisitor: z.number(),
  }),
});
export const journeymanSigningRaw = z.object({
  id: z.number(),
  instant: z.string(),
  rosterId: z.number(),
  extraData: z.object({ journeymenCount: z.number() }),
});
/**
 * TP's `extraData.expensiveMistake` is which tier of the Expensive Mistakes
 * table was rolled (1 = no cost, 2 = a partial-treasury cost, 3 = half the
 * treasury), not the money lost — `extraData.totalCost` carries that.
 */
export const expensiveMistakeRaw = z.object({
  id: z.number(),
  instant: z.string(),
  rosterId: z.number(),
  extraData: z.object({ totalCost: z.number() }),
});
export const dedicatedFansRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    dedicatedFansModifierLocal: z.number(),
    dedicatedFansModifierVisitor: z.number(),
  }),
});
export const secretObjectiveRaw = z.object({
  id: z.number(),
  instant: z.string(),
  rosterId: z.number(),
  extraData: z.object({ secretObjective: z.number() }),
});
export const prayersToNuffleRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({ prayersToNuffle: z.number() }),
});
export const concessionRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    concedeLocal: z.boolean(),
    concedeVisitor: z.boolean(),
  }),
});

export type Decoder = (raw: unknown) => TpMatchEvent;

export function decode<T>(
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

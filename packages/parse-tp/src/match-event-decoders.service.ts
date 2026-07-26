import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { TpMatchEvent } from './match-event-parser.service';
import { SecretObjectiveService } from './secret-objective.service';
import { WeatherTypeService } from './weather-type.service';

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
const mvpAwardRaw = z.object({
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
  turnNumber: z.number().nullish(),
  injuryType: injuryTypeSchema,
});
const casualtyCausedRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
  turnNumber: z.number().nullish(),
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
/**
 * TP's `extraData.expensiveMistake` is which tier of the Expensive Mistakes
 * table was rolled (1 = no cost, 2 = a partial-treasury cost, 3 = half the
 * treasury), not the money lost — `extraData.totalCost` carries that.
 */
const expensiveMistakeRaw = z.object({
  id: z.number(),
  instant: z.string(),
  rosterId: z.number(),
  extraData: z.object({ totalCost: z.number() }),
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

export type Decoder = (raw: unknown) => TpMatchEvent;

@Injectable()
export class MatchEventDecodersService {
  constructor(
    private readonly secretObjective: SecretObjectiveService,
    private readonly weatherType: WeatherTypeService,
  ) {}

  private decode<T>(
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

  build(): Map<number, Decoder> {
    return new Map<number, Decoder>([
      [
        3,
        this.decode(touchdownRaw, 3, (v) => ({
          type: 'completion',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        4,
        this.decode(touchdownRaw, 4, (v) => ({
          type: 'touchdown',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        5,
        this.decode(touchdownRaw, 5, (v) => ({
          type: 'interception',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        6,
        this.decode(casualtyCausedRaw, 6, (v) => ({
          type: 'casualty_caused',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
          ...(v.turnNumber != null ? { turnNumber: v.turnNumber } : {}),
        })),
      ],
      [
        7,
        this.decode(mvpAwardRaw, 7, (v) => ({
          type: 'mvp_award',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        8,
        this.decode(injuryRaw, 8, (v) => ({
          type: 'injury',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
          ...(v.turnRosterId != null ? { turnRosterId: v.turnRosterId } : {}),
          ...(v.turnNumber != null ? { turnNumber: v.turnNumber } : {}),
          injuryType: v.injuryType,
        })),
      ],
      [
        10,
        this.decode(weatherRaw, 10, (v) => ({
          type: 'weather_roll',
          tpEventId: v.id,
          instant: v.instant,
          weatherType: this.weatherType.decode(v.extraData.weatherType),
        })),
      ],
      [
        11,
        this.decode(inducementsRaw, 11, (v) => ({
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
        this.decode(winningsRaw, 12, (v) => ({
          type: 'winnings_roll',
          tpEventId: v.id,
          instant: v.instant,
          localWinnings: v.extraData.localWinnings,
          visitorWinnings: v.extraData.visitorWinnings,
        })),
      ],
      [
        13,
        this.decode(fanFactorRaw, 13, (v) => ({
          type: 'fan_factor_roll',
          tpEventId: v.id,
          instant: v.instant,
          newFanFactorLocal: v.extraData.newFanFactorLocal,
          newFanFactorVisitor: v.extraData.newFanFactorVisitor,
        })),
      ],
      [
        14,
        this.decode(expensiveMistakeRaw, 14, (v) => ({
          type: 'expensive_mistake',
          tpEventId: v.id,
          instant: v.instant,
          rosterId: v.rosterId,
          expensiveMistake: v.extraData.totalCost,
        })),
      ],
      [
        15,
        this.decode(journeymanSigningRaw, 15, (v) => ({
          type: 'journeyman_signing',
          tpEventId: v.id,
          instant: v.instant,
          rosterId: v.rosterId,
          journeymenCount: v.extraData.journeymenCount,
        })),
      ],
      [
        20,
        this.decode(concessionRaw, 20, (v) => ({
          type: 'concession',
          tpEventId: v.id,
          instant: v.instant,
          concedeLocal: v.extraData.concedeLocal,
          concedeVisitor: v.extraData.concedeVisitor,
        })),
      ],
      [
        23,
        this.decode(prayersToNuffleRaw, 23, (v) => ({
          type: 'prayers_to_nuffle',
          tpEventId: v.id,
          instant: v.instant,
          prayersToNuffle: v.extraData.prayersToNuffle,
        })),
      ],
      [
        25,
        this.decode(touchdownRaw, 25, (v) => ({
          type: 'deflection',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        26,
        this.decode(dedicatedFansRaw, 26, (v) => ({
          type: 'dedicated_fans_roll',
          tpEventId: v.id,
          instant: v.instant,
          dedicatedFansModifierLocal: v.extraData.dedicatedFansModifierLocal,
          dedicatedFansModifierVisitor:
            v.extraData.dedicatedFansModifierVisitor,
        })),
      ],
      [
        31,
        this.decode(touchdownRaw, 31, (v) => ({
          type: 'foul',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        32,
        this.decode(touchdownRaw, 32, (v) => ({
          type: 'sent_off',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        42,
        this.decode(secretObjectiveRaw, 42, (v) => ({
          type: 'secret_objective',
          tpEventId: v.id,
          instant: v.instant,
          rosterId: v.rosterId,
          secretObjective: this.secretObjective.decode(
            v.extraData.secretObjective,
          ),
        })),
      ],
      [
        46,
        this.decode(touchdownRaw, 46, (v) => ({
          type: 'successful_landing',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
    ]);
  }
}

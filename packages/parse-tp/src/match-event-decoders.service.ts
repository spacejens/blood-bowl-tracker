import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { Decoder, TpMatchEvent } from './match-event.types';
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
  starPoints: z.number().optional(),
});
const mvpAwardRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
  starPoints: z.number().optional(),
});
const injuryRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
  turnRosterId: z.number().nullish(),
  turnNumber: z.number().nullish(),
  injuryType: injuryTypeSchema,
  starPoints: z.number().optional(),
});
const casualtyCausedRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
  turnNumber: z.number().nullish(),
  starPoints: z.number().optional(),
});
/**
 * Code 31 (`foul`) carries turn fields that `touchdownRaw` does not decode.
 * They are what lets a foul be paired with the `injury` it caused (see
 * `tools/import-tp`'s `correlateFouls`). `rosterId` is already the fouler's
 * own team, so `turnRosterId` is expected to equal it; it is decoded anyway
 * for symmetry with `injury.turnRosterId`.
 */
const foulRaw = z.object({
  id: z.number(),
  instant: z.string(),
  lineUpId: z.number(),
  rosterId: z.number(),
  turnNumber: z.number().nullish(),
  turnRosterId: z.number().nullish(),
  starPoints: z.number().optional(),
});
const weatherRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    weatherType: z.number(),
    /**
     * Which weather table `weatherType` indexes into. Always `0` in data
     * before Major Season 30 and absent in the oldest events, so a missing
     * value is treated as the classic table `0`.
     */
    weatherTable: z.number().nullish(),
  }),
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
/**
 * TP keeps `extraData.newFanFactorLocal`/`newFanFactorVisitor` (and the
 * sibling `fanFactorModifier*` fields) pinned at 0 in real payloads for this
 * event — TP never precomputes fan factor for this league. Per the BB2020
 * rules, fan factor for a match is Dedicated Fans + a fresh 1d3 roll, and TP
 * does send both ingredients: `extraData.roll1*` (the d3 roll) and
 * `extraData.dedicatedFans*` (the team's current Dedicated Fans count) — see
 * the decode mapping below, which computes the sum ourselves.
 */
const fanFactorRaw = z.object({
  id: z.number(),
  instant: z.string(),
  extraData: z.object({
    roll1Local: z.number(),
    roll1Visitor: z.number(),
    dedicatedFansLocal: z.number(),
    dedicatedFansVisitor: z.number(),
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
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
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
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
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
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
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
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
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
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
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
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
        })),
      ],
      [
        10,
        this.decode(weatherRaw, 10, (v) => ({
          type: 'weather_roll',
          tpEventId: v.id,
          instant: v.instant,
          weatherType: this.weatherType.decode(
            v.extraData.weatherTable ?? 0,
            v.extraData.weatherType,
          ),
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
          fanFactorLocal:
            v.extraData.dedicatedFansLocal + v.extraData.roll1Local,
          fanFactorVisitor:
            v.extraData.dedicatedFansVisitor + v.extraData.roll1Visitor,
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
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
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
        this.decode(foulRaw, 31, (v) => ({
          type: 'foul',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
          ...(v.turnNumber != null ? { turnNumber: v.turnNumber } : {}),
          ...(v.turnRosterId != null ? { turnRosterId: v.turnRosterId } : {}),
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
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
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
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
        45,
        this.decode(touchdownRaw, 45, (v) => ({
          type: 'throw_team_mate',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
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
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
        })),
      ],
      [
        47,
        this.decode(touchdownRaw, 47, (v) => ({
          type: 'catch',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
          ...(v.starPoints != null ? { starPoints: v.starPoints } : {}),
        })),
      ],
    ]);
  }
}

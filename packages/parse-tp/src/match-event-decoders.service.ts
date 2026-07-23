import { Injectable } from '@nestjs/common';

import {
  casualtyCausedRaw,
  concessionRaw,
  decode,
  type Decoder,
  dedicatedFansRaw,
  expensiveMistakeRaw,
  fanFactorRaw,
  inducementsRaw,
  injuryRaw,
  journeymanSigningRaw,
  mvpAwardRaw,
  prayersToNuffleRaw,
  secretObjectiveRaw,
  touchdownRaw,
  weatherRaw,
  winningsRaw,
} from './match-event-decoders';
import { SecretObjectiveService } from './secret-objective.service';
import { WeatherTypeService } from './weather-type.service';

@Injectable()
export class MatchEventDecodersService {
  constructor(
    private readonly secretObjective: SecretObjectiveService,
    private readonly weatherType: WeatherTypeService,
  ) {}

  build(): Map<number, Decoder> {
    return new Map<number, Decoder>([
      [
        3,
        decode(touchdownRaw, 3, (v) => ({
          type: 'completion',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
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
        5,
        decode(touchdownRaw, 5, (v) => ({
          type: 'interception',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        6,
        decode(casualtyCausedRaw, 6, (v) => ({
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
        decode(mvpAwardRaw, 7, (v) => ({
          type: 'mvp_award',
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
          ...(v.turnNumber != null ? { turnNumber: v.turnNumber } : {}),
          injuryType: v.injuryType,
        })),
      ],
      [
        10,
        decode(weatherRaw, 10, (v) => ({
          type: 'weather_roll',
          tpEventId: v.id,
          instant: v.instant,
          weatherType: this.weatherType.decode(v.extraData.weatherType),
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
          expensiveMistake: v.extraData.totalCost,
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
        25,
        decode(touchdownRaw, 25, (v) => ({
          type: 'deflection',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        26,
        decode(dedicatedFansRaw, 26, (v) => ({
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
        decode(touchdownRaw, 31, (v) => ({
          type: 'foul',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        32,
        decode(touchdownRaw, 32, (v) => ({
          type: 'sent_off',
          tpEventId: v.id,
          instant: v.instant,
          lineUpId: v.lineUpId,
          rosterId: v.rosterId,
        })),
      ],
      [
        42,
        decode(secretObjectiveRaw, 42, (v) => ({
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
        decode(touchdownRaw, 46, (v) => ({
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

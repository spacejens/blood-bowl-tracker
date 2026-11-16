import type { CharacteristicLine } from '@blood-bowl-tracker/api-contract';
import type {
  CharacteristicFormat,
  PlayerCharacteristic,
} from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type { PositionCharacteristicsContext } from '../position-rules-sets/position-rules-sets.service';
import { PositionRulesSetsService } from '../position-rules-sets/position-rules-sets.service';
import type { LastingReductionCounts } from './player-fill.types';

export interface ReductionsInput {
  positionId: number;
  eraId: number;
  /** The player's current characteristics. */
  line: CharacteristicLine;
  /** One element per characteristic increase he has. */
  increases: readonly PlayerCharacteristic[];
}

/** One characteristic, with its increase, its counter and its format. */
interface Comparison {
  key: keyof CharacteristicLine;
  increase: PlayerCharacteristic;
  counter: keyof LastingReductionCounts;
  format: Exclude<
    keyof PositionCharacteristicsContext,
    'rulesSetId' | 'baseline'
  >;
  /** Whether a lower value is the better one under a target-number format. */
  rollTarget: boolean;
}

const COMPARISONS: readonly Comparison[] = [
  {
    key: 'move',
    increase: 'MA',
    counter: 'moveReductionCount',
    format: 'moveFormat',
    rollTarget: false,
  },
  {
    key: 'strength',
    increase: 'ST',
    counter: 'strengthReductionCount',
    format: 'strengthFormat',
    rollTarget: false,
  },
  {
    key: 'agility',
    increase: 'AG',
    counter: 'agilityReductionCount',
    format: 'agilityFormat',
    rollTarget: true,
  },
  {
    key: 'passing',
    increase: 'PA',
    counter: 'passingReductionCount',
    format: 'passingFormat',
    rollTarget: true,
  },
  {
    key: 'armour',
    increase: 'AV',
    counter: 'armourReductionCount',
    format: 'armourFormat',
    rollTarget: false,
  },
];

/**
 * Derives a player's five lasting stat-reduction counts from his current
 * characteristics and characteristic increases: for each characteristic, how
 * far the value sits on the worse side of the position's baseline once the
 * increases are counted,
 *
 *   reduction = max(0, increases - gap)
 *
 * where `gap` is how far the value is on the better side of the baseline
 * (negative on the worse side). It is the identity
 * TpCharacteristicIncreasesService uses (increases = gap + reduction) solved
 * for the reduction. AG and PA are better when lower under a `plus` or
 * `plus_zero_legal` format; every other characteristic is better when higher.
 *
 * The baseline and formats are those
 * PositionRulesSetsService.findCharacteristicsContext resolves, which the
 * player deepdive also compares against. Without a baseline every count is
 * 0, and so is a characteristic with an `absent` format or a null value.
 */
@Injectable()
export class PlayerFillReductionsService {
  constructor(private readonly positionRulesSets: PositionRulesSetsService) {}

  async derive(input: ReductionsInput): Promise<LastingReductionCounts> {
    const counts: LastingReductionCounts = {
      moveReductionCount: 0,
      strengthReductionCount: 0,
      agilityReductionCount: 0,
      passingReductionCount: 0,
      armourReductionCount: 0,
    };
    const context = await this.positionRulesSets.findCharacteristicsContext(
      input.positionId,
      input.eraId,
    );
    const baseline = context?.baseline;
    if (context === undefined || baseline === undefined) {
      return counts;
    }
    for (const comparison of COMPARISONS) {
      const format: CharacteristicFormat = context[comparison.format];
      const value = input.line[comparison.key];
      const start = baseline[comparison.key];
      if (format === 'absent' || value === null || start === null) {
        continue;
      }
      const lowerIsBetter =
        comparison.rollTarget &&
        (format === 'plus' || format === 'plus_zero_legal');
      const gap = lowerIsBetter ? start - value : value - start;
      const increases = input.increases.filter(
        (increase) => increase === comparison.increase,
      ).length;
      counts[comparison.counter] = Math.max(0, increases - gap);
    }
    return counts;
  }
}

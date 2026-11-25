import type { CharacteristicLine } from '@blood-bowl-tracker/api-contract';
import type { PlayerCharacteristic } from '@blood-bowl-tracker/domain-enums';
import { PLAYER_CHARACTERISTICS } from '@blood-bowl-tracker/domain-enums';
import { LastingReductionService } from '@blood-bowl-tracker/game-rules';
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
}

const COMPARISON_BY_INCREASE: Readonly<
  Record<PlayerCharacteristic, Omit<Comparison, 'increase'>>
> = {
  MA: {
    key: 'move',
    counter: 'moveReductionCount',
    format: 'moveFormat',
  },
  ST: {
    key: 'strength',
    counter: 'strengthReductionCount',
    format: 'strengthFormat',
  },
  AG: {
    key: 'agility',
    counter: 'agilityReductionCount',
    format: 'agilityFormat',
  },
  PA: {
    key: 'passing',
    counter: 'passingReductionCount',
    format: 'passingFormat',
  },
  AV: {
    key: 'armour',
    counter: 'armourReductionCount',
    format: 'armourFormat',
  },
};

/** One comparison per characteristic, in PLAYER_CHARACTERISTICS order. */
const COMPARISONS: readonly Comparison[] = PLAYER_CHARACTERISTICS.map(
  (increase) => ({ increase, ...COMPARISON_BY_INCREASE[increase] }),
);

/**
 * Derives a player's five lasting stat-reduction counts from his current
 * characteristics and characteristic increases, one characteristic at a time
 * through game-rules' LastingReductionService.
 *
 * The baseline and formats are those
 * PositionRulesSetsService.findCharacteristicsContext resolves, which the
 * player deepdive also compares against. Without a baseline every count is
 * 0.
 */
@Injectable()
export class PlayerFillReductionsService {
  constructor(
    private readonly positionRulesSets: PositionRulesSetsService,
    private readonly lastingReduction: LastingReductionService,
  ) {}

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
      counts[comparison.counter] = this.lastingReduction.reduction({
        characteristic: comparison.increase,
        format: context[comparison.format],
        value: input.line[comparison.key],
        start: baseline[comparison.key],
        increases: input.increases.filter(
          (increase) => increase === comparison.increase,
        ).length,
      });
    }
    return counts;
  }
}

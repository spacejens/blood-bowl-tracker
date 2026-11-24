import type { PlayerCharacteristic } from '@blood-bowl-tracker/domain-enums';
import type { PlayerDetail } from '@blood-bowl-tracker/game-data-queries';

/**
 * Each characteristic's reduction counter; the line writes them under the
 * characteristic's label, in PLAYER_CHARACTERISTICS order.
 */
export const REDUCTION_FIELDS = {
  MA: 'moveReductionCount',
  ST: 'strengthReductionCount',
  AG: 'agilityReductionCount',
  PA: 'passingReductionCount',
  AV: 'armourReductionCount',
} as const satisfies Record<PlayerCharacteristic, keyof PlayerDetail>;

import type {
  CharacteristicFormat,
  PlayerCharacteristic,
} from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

/** AG and PA are better when lower, under a target-number format. */
const ROLL_TARGETS: ReadonlySet<PlayerCharacteristic> = new Set(['AG', 'PA']);

export interface LastingReductionInput {
  characteristic: PlayerCharacteristic;
  format: CharacteristicFormat;
  /** The player's current value; null when he has none (e.g. no PA). */
  value: number | null;
  /** The position's baseline value; null when the baseline has none. */
  start: number | null;
  /** How many increases of this characteristic he has. */
  increases: number;
}

/**
 * How many lasting reductions one characteristic shows: how far the value
 * sits on the worse side of the baseline once the increases are counted,
 *
 *   reduction = max(0, increases - gap)
 *
 * where `gap` is how far the value is on the better side of the baseline
 * (negative on the worse side). AG and PA are better when lower under a
 * `plus` or `plus_zero_legal` format; every other characteristic, and AG
 * and PA under any other format, is better when higher. An `absent`
 * format, or a null value or baseline, shows none.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class LastingReductionService {
  reduction(input: LastingReductionInput): number {
    const { format, value, start } = input;
    if (format === 'absent' || value === null || start === null) {
      return 0;
    }
    const lowerIsBetter =
      ROLL_TARGETS.has(input.characteristic) &&
      (format === 'plus' || format === 'plus_zero_legal');
    const gap = lowerIsBetter ? start - value : value - start;
    return Math.max(0, input.increases - gap);
  }
}

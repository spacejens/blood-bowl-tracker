import type { CharacteristicFormat } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  CharacteristicFormats,
  CharacteristicKey,
  CharacteristicLine,
  ReductionCounts,
} from './fill-plan.types';
import { CHARACTERISTIC_KEYS } from './fill-plan.types';

/** The most a characteristic can be reduced below the position's start value. */
export const REDUCTION_CAP = 2;

/** The worst die-roll target a target-number characteristic can reach. */
const WORST_TARGET = 6;

/** The lowest target-number Armour a reduction can leave (3+). */
const TARGET_ARMOUR_FLOOR = 3;

/** The lowest value any other characteristic can be reduced to. */
const BARE_FLOOR = 1;

export interface ImproveInput {
  line: CharacteristicLine;
  formats: CharacteristicFormats;
  characteristic: CharacteristicKey;
}

export interface ReduceInput {
  /** The position's start line, which the reductions are counted from. */
  line: CharacteristicLine;
  formats: CharacteristicFormats;
  reductions: ReductionCounts;
}

/**
 * Applies characteristic increases and stat reductions to a line, by the
 * characteristic's format: AG and PA in a target-number format (`plus`,
 * `plus_zero_legal`) get better as they go down; every other characteristic
 * gets better as it goes up. A reduction worsens the value by one, never by
 * more than REDUCTION_CAP in all, and never past the floor: MA, ST and a bare
 * characteristic 1, target-number AG and PA 6+, target-number AV 3+. A
 * structural-zero or absent PA is unaffected. These limits are the
 * rulebooks'; the database holds none.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class CharacteristicChangeService {
  /** The line with one increase applied; undefined when it cannot be applied. */
  improve(input: ImproveInput): CharacteristicLine | undefined {
    const { line, formats, characteristic } = input;
    const value = line[characteristic];
    const format = formats[characteristic];
    if (value === null || format === 'absent') {
      return undefined;
    }
    const next = { ...line };
    if (!this.lowerIsBetter(characteristic, format)) {
      next[characteristic] = value + 1;
      return next;
    }
    // 1+ is the best target, and 0 is a player who cannot pass at all.
    if (value <= 1) {
      return undefined;
    }
    next[characteristic] = value - 1;
    return next;
  }

  reduce(input: ReduceInput): CharacteristicLine {
    const reduced = { ...input.line };
    for (const key of CHARACTERISTIC_KEYS) {
      const value = input.line[key];
      const count = input.reductions[key];
      if (value === null || count === 0) {
        continue;
      }
      const format = input.formats[key];
      const steps = Math.min(
        count,
        REDUCTION_CAP,
        this.room({ key, value, format }),
      );
      reduced[key] = this.lowerIsBetter(key, format)
        ? value + steps
        : value - steps;
    }
    return reduced;
  }

  private lowerIsBetter(
    key: CharacteristicKey,
    format: CharacteristicFormat,
  ): boolean {
    return (
      (key === 'ag' || key === 'pa') &&
      (format === 'plus' || format === 'plus_zero_legal')
    );
  }

  /** How many points the value can still worsen before its floor. */
  private room(at: {
    key: CharacteristicKey;
    value: number;
    format: CharacteristicFormat;
  }): number {
    const { key, value, format } = at;
    if (this.lowerIsBetter(key, format)) {
      return value === 0 ? 0 : Math.max(0, WORST_TARGET - value);
    }
    const floor =
      key === 'av' && format !== 'bare' ? TARGET_ARMOUR_FLOOR : BARE_FLOOR;
    return Math.max(0, value - floor);
  }
}

import type { CharacteristicFormat } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  CharacteristicFormats,
  CharacteristicLine,
  ReductionCounts,
} from './fill-plan.types';

export interface ReductionInput {
  line: CharacteristicLine;
  formats: CharacteristicFormats;
  reductions: ReductionCounts;
}

interface AdjustOptions {
  value: number;
  format: CharacteristicFormat;
  count: number;
}

interface PassingOptions {
  value: number | null;
  format: CharacteristicFormat;
  count: number;
}

/** The worst die-roll target a target-number characteristic can have. */
const WORST_TARGET = 6;

/**
 * Applies a player's lasting stat reductions to his position's line. MA, ST
 * and AV lose a point per reduction. AG and PA depend on the rules set's
 * format: a target number ("3+") gets worse by rising, up to 6+, while a
 * bare value (the older rules sets' Agility) falls like MA. Any value that
 * ends up invalid makes the whole line invalid (undefined): below 1, a
 * target past 6+, a reduced structural-zero Passing, or a Passing that does
 * not match whether the rules set has one.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class CharacteristicReductionService {
  apply(input: ReductionInput): CharacteristicLine | undefined {
    const { line, formats, reductions } = input;
    const ma = this.lowered(line.ma, reductions.ma);
    const st = this.lowered(line.st, reductions.st);
    const av = this.lowered(line.av, reductions.av);
    const ag = this.adjusted({
      value: line.ag,
      format: formats.ag,
      count: reductions.ag,
    });
    const pa = this.passing({
      value: line.pa,
      format: formats.pa,
      count: reductions.pa,
    });
    if (
      ma === undefined ||
      st === undefined ||
      av === undefined ||
      ag === undefined ||
      pa === undefined
    ) {
      return undefined;
    }
    return { ma, st, ag, pa, av };
  }

  private lowered(value: number, count: number): number | undefined {
    const next = value - count;
    return next >= 1 ? next : undefined;
  }

  private adjusted(options: AdjustOptions): number | undefined {
    const { value, format, count } = options;
    if (format === 'absent') {
      return undefined;
    }
    if (format === 'bare') {
      return this.lowered(value, count);
    }
    if (value === 0) {
      return format === 'plus_zero_legal' && count === 0 ? 0 : undefined;
    }
    const next = value + count;
    return next >= 1 && next <= WORST_TARGET ? next : undefined;
  }

  /** Null for a rules set with no Passing, undefined when invalid. */
  private passing(options: PassingOptions): number | null | undefined {
    if (options.format === 'absent') {
      return options.value === null && options.count === 0 ? null : undefined;
    }
    if (options.value === null) {
      return undefined;
    }
    return this.adjusted({
      value: options.value,
      format: options.format,
      count: options.count,
    });
  }
}

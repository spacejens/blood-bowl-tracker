import { Injectable } from '@nestjs/common';

import {
  CHARACTERISTIC_KEYS,
  type LastingInjuryRepairCandidate,
  type LastingInjuryRepairEntry,
  type ReductionCounts,
} from './fill-plan.types';

/** AG and PA are better when lower, under a target-number format. */
const ROLL_TARGET_KEYS: ReadonlySet<string> = new Set(['ag', 'pa']);

/**
 * Picks the `lastingInjuryRepairs` entries the server would act on: the
 * candidates for whom `players.recordLastingReductions` derives at least one
 * reduction, so no entry is a no-op. `derive` mirrors game-data's
 * PlayerFillReductionsService: per characteristic,
 *
 *   reduction = max(0, increases - gap)
 *
 * where `gap` is how far the stored value sits on the better side of the
 * start line (negative on the worse side). AG and PA are better when lower
 * under a `plus` or `plus_zero_legal` format; every other characteristic is
 * better when higher. Without a rules set or a start line every count is 0,
 * and so is a characteristic with an `absent` format or a null value or
 * start value. lasting-injury-repair-selector.drift.spec.ts requires both to
 * agree.
 */
@Injectable()
export class LastingInjuryRepairSelectorService {
  select(
    candidates: readonly LastingInjuryRepairCandidate[],
  ): LastingInjuryRepairEntry[] {
    return candidates
      .filter((candidate) =>
        Object.values(this.derive(candidate)).some((count) => count > 0),
      )
      .map(({ player }) => ({ player }));
  }

  derive(candidate: LastingInjuryRepairCandidate): ReductionCounts {
    const counts: ReductionCounts = { ma: 0, st: 0, ag: 0, pa: 0, av: 0 };
    const { context } = candidate;
    if (context === null || context.baseline === null) {
      return counts;
    }
    const { baseline, formats } = context;
    for (const key of CHARACTERISTIC_KEYS) {
      const format = formats[key];
      const value = candidate.line[key];
      const start = baseline[key];
      if (format === 'absent' || value === null || start === null) {
        continue;
      }
      const lowerIsBetter =
        ROLL_TARGET_KEYS.has(key) &&
        (format === 'plus' || format === 'plus_zero_legal');
      const gap = lowerIsBetter ? start - value : value - start;
      const increases = candidate.increases.filter((k) => k === key).length;
      counts[key] = Math.max(0, increases - gap);
    }
    return counts;
  }
}

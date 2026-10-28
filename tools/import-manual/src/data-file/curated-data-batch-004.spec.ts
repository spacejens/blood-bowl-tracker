import { describe, expect, it } from 'vitest';

import { BATCH_004, listBatches, readBatch } from './curated-data.test-helpers';

/** The cumulative SPP thresholds CRP, CRP+ and BB2016 share. */
const FIXED_THRESHOLDS = [6, 16, 31, 51, 76, 176];
const FIXED_THRESHOLD_RULES_SETS = ['BB2016', 'CRP', 'CRP+'];

describe('curated batch 004 advancement costs', () => {
  it('exists as its own batch', () => {
    expect(listBatches()).toContain(BATCH_004);
  });

  it('curates exactly the fixed-threshold rules sets, by bare name', () => {
    const costs = readBatch(BATCH_004).advancementCosts;
    expect(costs.every((cost) => cost.rulesSet.system === 'Name')).toBe(true);
    expect([...new Set(costs.map((cost) => cost.rulesSet.id))].sort()).toEqual(
      FIXED_THRESHOLD_RULES_SETS,
    );
  });

  it.each(FIXED_THRESHOLD_RULES_SETS)(
    'prices the %s advancements so their running total reaches each threshold',
    (rulesSet) => {
      const rows = readBatch(BATCH_004)
        .advancementCosts.filter((cost) => cost.rulesSet.id === rulesSet)
        .sort((a, b) => a.advancementNumber - b.advancementNumber);

      expect(rows.map((row) => row.advancementNumber)).toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
      expect(rows.every((row) => row.advancementKind === 'table_roll')).toBe(
        true,
      );
      const runningTotals = rows.reduce<number[]>(
        (totals, row) => [...totals, (totals.at(-1) ?? 0) + row.sppCost],
        [],
      );
      expect(runningTotals).toEqual(FIXED_THRESHOLDS);
    },
  );
});

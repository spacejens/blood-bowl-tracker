import { describe, expect, it } from 'vitest';

import {
  BATCH_001,
  BATCH_004,
  listBatches,
  readBatch,
} from './curated-data.test-helpers';

/** The cumulative SPP thresholds CRP, CRP+ and BB2016 share. */
const FIXED_THRESHOLDS = [6, 16, 31, 51, 76, 176];
const FIXED_THRESHOLD_RULES_SETS = ['BB2016', 'CRP', 'CRP+'];

/** BB2020 (and DB2021) cost per kind, for advancements 1 to 6. */
const BB2020_COSTS = {
  random_primary_skill: [3, 4, 6, 8, 10, 15],
  chosen_primary_skill: [6, 8, 12, 16, 20, 30],
  random_secondary_skill: [6, 8, 12, 16, 20, 30],
  chosen_secondary_skill: [12, 14, 18, 22, 26, 40],
  random_characteristic: [18, 20, 24, 28, 32, 50],
};

/** BB2025 cost per kind, for advancements 1 to 6. */
const BB2025_COSTS = {
  random_primary_skill: [3, 4, 6, 8, 10, 15],
  chosen_primary_skill: [6, 8, 12, 16, 20, 30],
  chosen_secondary_skill: [10, 12, 16, 20, 24, 34],
  random_characteristic: [14, 16, 20, 24, 28, 38],
};

const TYPE_PRICED_COSTS: Record<string, Record<string, number[]>> = {
  BB2020: BB2020_COSTS,
  DB2021: BB2020_COSTS,
  BB2025: BB2025_COSTS,
};

function costsOf(rulesSet: string) {
  return readBatch(BATCH_004).advancementCosts.filter(
    (cost) => cost.rulesSet.id === rulesSet,
  );
}

/**
 * One rules set's costs as `{ kind: [cost of advancement 1, 2, ...] }`. A
 * missing advancement number leaves a hole and an extra one lengthens the
 * array, so comparing against a pinned table also checks the numbering.
 */
function costTable(rulesSet: string): Record<string, number[]> {
  const table: Record<string, number[]> = {};
  for (const cost of costsOf(rulesSet)) {
    (table[cost.advancementKind] ??= [])[cost.advancementNumber - 1] =
      cost.sppCost;
  }
  return table;
}

describe('curated batch 004 advancement costs', () => {
  it('exists as its own batch', () => {
    expect(listBatches()).toContain(BATCH_004);
  });

  it('curates every rules set, by bare name', () => {
    const costs = readBatch(BATCH_004).advancementCosts;
    expect(costs.every((cost) => cost.rulesSet.system === 'Name')).toBe(true);
    expect([...new Set(costs.map((cost) => cost.rulesSet.id))].sort()).toEqual([
      'BB2016',
      'BB2020',
      'BB2025',
      'CRP',
      'CRP+',
      'DB2021',
    ]);
  });

  it('holds 18 fixed-threshold and 84 type-priced rows', () => {
    expect(readBatch(BATCH_004).advancementCosts).toHaveLength(102);
  });

  it('references only rules sets batch 001 declares', () => {
    const declared = new Set(
      readBatch(BATCH_001)
        .rulesSets.flatMap((rulesSet) => rulesSet.externalIds)
        .filter((externalId) => externalId.system === 'Name')
        .map((externalId) => externalId.id),
    );
    const referenced = readBatch(BATCH_004).advancementCosts.map(
      (cost) => cost.rulesSet.id,
    );
    expect(referenced.filter((id) => !declared.has(id))).toEqual([]);
  });

  it('never repeats a natural key', () => {
    const keys = readBatch(BATCH_004).advancementCosts.map(
      (cost) =>
        `${cost.rulesSet.id}|${cost.advancementNumber}|${cost.advancementKind}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(FIXED_THRESHOLD_RULES_SETS)(
    'prices the %s advancements so their running total reaches each threshold',
    (rulesSet) => {
      const rows = costsOf(rulesSet).sort(
        (a, b) => a.advancementNumber - b.advancementNumber,
      );

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

  it.each(Object.keys(TYPE_PRICED_COSTS))(
    'prices the %s advancements by kind',
    (rulesSet) => {
      expect(costTable(rulesSet)).toEqual(TYPE_PRICED_COSTS[rulesSet]);
    },
  );

  it('prices DB2021 exactly like BB2020', () => {
    expect(costTable('DB2021')).toEqual(costTable('BB2020'));
  });

  it('offers no random secondary skill under BB2025', () => {
    expect(
      costsOf('BB2025').some(
        (cost) => cost.advancementKind === 'random_secondary_skill',
      ),
    ).toBe(false);
  });
});

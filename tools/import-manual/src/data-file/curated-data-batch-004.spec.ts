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

/** tLoEG's house rule: Fan Favourite at this total SPP. */
const TLOEG = { system: 'tloeg.bbleague.se', id: 'tLoEG' };
const FAN_FAVOURITE = { system: 'Name', id: 'Fan Favourite' };
const TLOEG_FAN_FAVOURITE_TOTAL = 301;

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

const costs = () => readBatch(BATCH_004).advancementCosts;
const rulesSetRows = () => costs().filter((cost) => cost.league === undefined);
const leagueRows = () => costs().filter((cost) => cost.league !== undefined);

/** One rules set's own rows, without any league's additions. */
function costsOf(rulesSet: string) {
  return rulesSetRows().filter((cost) => cost.rulesSet.id === rulesSet);
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
    expect(costs().every((cost) => cost.rulesSet.system === 'Name')).toBe(true);
    expect(
      [...new Set(costs().map((cost) => cost.rulesSet.id))].sort(),
    ).toEqual(['BB2016', 'BB2020', 'BB2025', 'CRP', 'CRP+', 'DB2021']);
  });

  it('holds 18 fixed-threshold, 84 type-priced and 3 league rows', () => {
    const fixedThreshold = rulesSetRows().filter(
      (cost) => cost.advancementKind === 'table_roll',
    );
    expect(fixedThreshold).toHaveLength(18);
    expect(rulesSetRows().length - fixedThreshold.length).toBe(84);
    expect(leagueRows()).toHaveLength(3);
  });

  it('references only rules sets batch 001 declares', () => {
    const declared = new Set(
      readBatch(BATCH_001)
        .rulesSets.flatMap((rulesSet) => rulesSet.externalIds)
        .filter((externalId) => externalId.system === 'Name')
        .map((externalId) => externalId.id),
    );
    const referenced = costs().map((cost) => cost.rulesSet.id);
    expect(referenced.filter((id) => !declared.has(id))).toEqual([]);
  });

  it('never repeats a natural key', () => {
    const keys = costs().map(
      (cost) =>
        `${cost.rulesSet.id}|${cost.league?.id ?? ''}|${cost.advancementNumber}|${cost.advancementKind}`,
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
      expect(rows.every((row) => row.skill === undefined)).toBe(true);
      const runningTotals = rows.reduce<number[]>(
        (totals, row) => [...totals, (totals.at(-1) ?? 0) + row.sppCost],
        [],
      );
      expect(runningTotals).toEqual(FIXED_THRESHOLDS);
    },
  );

  it('adds the tLoEG Fan Favourite advancement only under CRP, CRP+ and BB2016', () => {
    const rows = leagueRows();
    expect(rows.map((row) => row.rulesSet.id).sort()).toEqual(
      FIXED_THRESHOLD_RULES_SETS,
    );
    for (const row of rows) {
      expect(row.league).toEqual(TLOEG);
      expect(row.advancementNumber).toBe(7);
      expect(row.advancementKind).toBe('granted_skill');
      expect(row.skill).toEqual(FAN_FAVOURITE);
    }
  });

  it.each(FIXED_THRESHOLD_RULES_SETS)(
    'brings a tLoEG player under %s to Fan Favourite at 301 SPP',
    (rulesSet) => {
      const total = costs()
        .filter((row) => row.rulesSet.id === rulesSet)
        .reduce((sum, row) => sum + row.sppCost, 0);

      expect(total).toBe(TLOEG_FAN_FAVOURITE_TOTAL);
    },
  );

  it('references a league and skill that batch 001 curates', () => {
    const seed = readBatch(BATCH_001);
    expect(
      seed.leagues.some((league) =>
        league.externalIds.some(
          (ref) => ref.system === TLOEG.system && ref.id === TLOEG.id,
        ),
      ),
    ).toBe(true);
    expect(
      seed.skills.some((skill) =>
        skill.externalIds.some(
          (ref) =>
            ref.system === FAN_FAVOURITE.system && ref.id === FAN_FAVOURITE.id,
        ),
      ),
    ).toBe(true);
  });

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

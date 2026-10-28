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

const costs = () => readBatch(BATCH_004).advancementCosts;
const rulesSetRows = () => costs().filter((cost) => cost.league === undefined);
const leagueRows = () => costs().filter((cost) => cost.league !== undefined);

describe('curated batch 004 advancement costs', () => {
  it('exists as its own batch', () => {
    expect(listBatches()).toContain(BATCH_004);
  });

  it('curates exactly the fixed-threshold rules sets, by bare name', () => {
    expect(costs().every((cost) => cost.rulesSet.system === 'Name')).toBe(true);
    expect(
      [...new Set(rulesSetRows().map((cost) => cost.rulesSet.id))].sort(),
    ).toEqual(FIXED_THRESHOLD_RULES_SETS);
  });

  it.each(FIXED_THRESHOLD_RULES_SETS)(
    'prices the %s advancements so their running total reaches each threshold',
    (rulesSet) => {
      const rows = rulesSetRows()
        .filter((cost) => cost.rulesSet.id === rulesSet)
        .sort((a, b) => a.advancementNumber - b.advancementNumber);

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
});

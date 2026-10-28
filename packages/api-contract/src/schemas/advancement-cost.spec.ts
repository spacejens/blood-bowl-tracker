import { describe, expect, it } from 'vitest';

import {
  AdvancementCostEntrySchema,
  AdvancementKindSchema,
  SyncAdvancementCostsResultSchema,
  SyncAdvancementCostsSchema,
} from './advancement-cost';

const entry = {
  rulesSetId: 1,
  advancementNumber: 1,
  advancementKind: 'table_roll',
  sppCost: 6,
};

const leagueEntry = {
  rulesSetId: 1,
  leagueId: 3,
  advancementNumber: 7,
  advancementKind: 'granted_skill',
  skillId: 40,
  sppCost: 125,
};

const ALL_KINDS = [
  'table_roll',
  'random_primary_skill',
  'chosen_primary_skill',
  'random_secondary_skill',
  'chosen_secondary_skill',
  'random_characteristic',
  'granted_skill',
];

describe('AdvancementKindSchema', () => {
  it('lists exactly the domain advancement kinds', () => {
    expect(AdvancementKindSchema.options).toEqual(ALL_KINDS);
  });
});

describe('AdvancementCostEntrySchema', () => {
  it('accepts a table-roll cost', () => {
    expect(AdvancementCostEntrySchema.parse(entry)).toEqual(entry);
  });

  it('accepts a league cost granting a fixed skill', () => {
    expect(AdvancementCostEntrySchema.parse(leagueEntry)).toEqual(leagueEntry);
  });

  it('leaves leagueId and skillId absent when an entry omits them', () => {
    const parsed = AdvancementCostEntrySchema.parse(entry);
    expect('leagueId' in parsed).toBe(false);
    expect('skillId' in parsed).toBe(false);
  });

  it.each(['leagueId', 'skillId'])('rejects a fractional %s', (field) => {
    expect(() =>
      AdvancementCostEntrySchema.parse({ ...leagueEntry, [field]: 1.5 }),
    ).toThrow();
  });

  it.each(ALL_KINDS)('accepts a %s cost', (advancementKind) => {
    expect(
      AdvancementCostEntrySchema.parse({ ...entry, advancementKind }),
    ).toEqual({ ...entry, advancementKind });
  });

  it('rejects an unknown advancement kind', () => {
    expect(() =>
      AdvancementCostEntrySchema.parse({ ...entry, advancementKind: 'skill' }),
    ).toThrow();
  });

  it.each([0, -1])('rejects advancement number %d', (advancementNumber) => {
    expect(() =>
      AdvancementCostEntrySchema.parse({ ...entry, advancementNumber }),
    ).toThrow();
  });

  it.each([0, -6])('rejects SPP cost %d', (sppCost) => {
    expect(() =>
      AdvancementCostEntrySchema.parse({ ...entry, sppCost }),
    ).toThrow();
  });

  it('rejects a fractional SPP cost', () => {
    expect(() =>
      AdvancementCostEntrySchema.parse({ ...entry, sppCost: 2.5 }),
    ).toThrow();
  });

  it('rejects a fractional advancement number', () => {
    expect(() =>
      AdvancementCostEntrySchema.parse({ ...entry, advancementNumber: 1.5 }),
    ).toThrow();
  });

  it.each(['rulesSetId', 'advancementNumber', 'advancementKind', 'sppCost'])(
    'rejects an entry missing %s',
    (field) => {
      const { [field]: _omitted, ...rest } = entry as Record<string, unknown>;
      expect(() => AdvancementCostEntrySchema.parse(rest)).toThrow();
    },
  );
});

describe('SyncAdvancementCostsSchema', () => {
  it('accepts an empty costs list', () => {
    expect(SyncAdvancementCostsSchema.parse({ costs: [] })).toEqual({
      costs: [],
    });
  });

  it('rejects a malformed entry inside the costs list', () => {
    expect(() =>
      SyncAdvancementCostsSchema.parse({
        costs: [entry, { ...entry, sppCost: 0 }],
      }),
    ).toThrow();
  });

  it('parses a result of synced ids', () => {
    expect(
      SyncAdvancementCostsResultSchema.parse({ advancementCostIds: [1, 2] }),
    ).toEqual({ advancementCostIds: [1, 2] });
  });
});

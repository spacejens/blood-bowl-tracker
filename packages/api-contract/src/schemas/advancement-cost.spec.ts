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

describe('AdvancementKindSchema', () => {
  it('lists exactly the domain advancement kinds', () => {
    expect(AdvancementKindSchema.options).toEqual(['table_roll']);
  });
});

describe('AdvancementCostEntrySchema', () => {
  it('accepts a table-roll cost', () => {
    expect(AdvancementCostEntrySchema.parse(entry)).toEqual(entry);
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
});

describe('SyncAdvancementCostsSchema', () => {
  it('accepts an empty costs list', () => {
    expect(SyncAdvancementCostsSchema.parse({ costs: [] })).toEqual({
      costs: [],
    });
  });

  it('parses a result of synced ids', () => {
    expect(
      SyncAdvancementCostsResultSchema.parse({ advancementCostIds: [1, 2] }),
    ).toEqual({ advancementCostIds: [1, 2] });
  });
});

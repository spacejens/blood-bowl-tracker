import { describe, expect, it } from 'vitest';

import { ManualDataFileSchema } from './manual-data-file.schema';

const entry = {
  player: { system: 'tourplay.net', id: '586220' },
  status: 'active',
  characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
  sppTotal: 18,
  unspentSpp: 0,
  startingSkills: [
    { system: 'Name', id: 'Block' },
    { skill: { system: 'Name', id: 'Loner' }, attributeValue: '4+' },
  ],
  advancements: [
    { skill: { system: 'Name', id: 'Dodge' }, source: 'chosen' },
    { characteristic: 'AG' },
    {
      skill: { system: 'Name', id: 'Hatred' },
      attributeValue: 'Dwarf',
      freeExtra: true,
    },
  ],
};

const parse = (fill: unknown) =>
  ManualDataFileSchema.safeParse({ incompletePlayerFills: [fill] });

describe('ManualDataFileSchema incompletePlayerFills', () => {
  it('defaults to no fills', () => {
    expect(ManualDataFileSchema.parse({}).incompletePlayerFills).toEqual([]);
  });

  it('accepts a complete fill', () => {
    const result = parse(entry);
    expect(result.success).toBe(true);
    expect(result.data?.incompletePlayerFills[0].advancements).toHaveLength(3);
  });

  it('accepts a fill without pa, for a rules set without Passing', () => {
    expect(
      parse({ ...entry, characteristics: { ma: 6, st: 3, ag: 3, av: 9 } })
        .success,
    ).toBe(true);
  });

  it('rejects an entry missing any field', () => {
    for (const key of Object.keys(entry)) {
      const partial: Record<string, unknown> = { ...entry };
      delete partial[key];
      expect(parse(partial).success).toBe(false);
    }
  });

  it('rejects a player outside TP', () => {
    expect(
      parse({ ...entry, player: { system: 'tloeg.bbleague.se', id: '1' } })
        .success,
    ).toBe(false);
  });

  it('rejects a zero characteristic other than pa, and an unknown key', () => {
    expect(
      parse({ ...entry, characteristics: { ...entry.characteristics, ma: 0 } })
        .success,
    ).toBe(false);
    expect(
      parse({ ...entry, characteristics: { ...entry.characteristics, PA: 4 } })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown status, a negative SPP figure and a starting source', () => {
    expect(parse({ ...entry, status: 'injured' }).success).toBe(false);
    expect(parse({ ...entry, unspentSpp: -1 }).success).toBe(false);
    expect(
      parse({
        ...entry,
        advancements: [
          { skill: { system: 'Name', id: 'Dodge' }, source: 'starting' },
        ],
      }).success,
    ).toBe(false);
  });
});

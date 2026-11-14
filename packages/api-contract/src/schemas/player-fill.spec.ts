import { describe, expect, it } from 'vitest';

import {
  FillIncompletePlayerResultSchema,
  FillIncompletePlayerSchema,
} from './player-fill';

const fill = {
  playerId: 9,
  status: 'active',
  characteristics: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
  sppTotal: 8,
  unspentSpp: 2,
  startingSkills: [{ skillId: 70, attributeValue: null }],
  advancements: [
    {
      kind: 'skill',
      skillId: 71,
      attributeValue: null,
      source: 'chosen',
      isFreeExtra: false,
    },
    { kind: 'characteristic', characteristic: 'AG' },
  ],
};

describe('FillIncompletePlayerSchema', () => {
  it('accepts a complete fill', () => {
    expect(FillIncompletePlayerSchema.safeParse(fill).success).toBe(true);
  });

  it('accepts a null passing for a rules set without Passing, and a zero one', () => {
    for (const passing of [null, 0]) {
      const result = FillIncompletePlayerSchema.safeParse({
        ...fill,
        characteristics: { ...fill.characteristics, passing },
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects a zero MA, ST, AG or AV, which would leave the player incomplete', () => {
    for (const key of ['move', 'strength', 'agility', 'armour']) {
      const result = FillIncompletePlayerSchema.safeParse({
        ...fill,
        characteristics: { ...fill.characteristics, [key]: 0 },
      });
      expect(result.success).toBe(false);
    }
  });

  it('rejects negative SPP figures', () => {
    expect(
      FillIncompletePlayerSchema.safeParse({ ...fill, sppTotal: -1 }).success,
    ).toBe(false);
    expect(
      FillIncompletePlayerSchema.safeParse({ ...fill, unspentSpp: -1 }).success,
    ).toBe(false);
  });

  it('requires every field', () => {
    for (const key of Object.keys(fill)) {
      const partial: Record<string, unknown> = { ...fill };
      delete partial[key];
      expect(FillIncompletePlayerSchema.safeParse(partial).success).toBe(false);
    }
  });

  it('rejects a starting source on an advancement', () => {
    const result = FillIncompletePlayerSchema.safeParse({
      ...fill,
      advancements: [
        {
          kind: 'skill',
          skillId: 71,
          attributeValue: null,
          source: 'starting',
          isFreeExtra: false,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('FillIncompletePlayerResultSchema', () => {
  it('reports whether the player was filled or left unchanged', () => {
    expect(
      FillIncompletePlayerResultSchema.safeParse({
        playerId: 9,
        outcome: 'unchanged',
      }).success,
    ).toBe(true);
    expect(
      FillIncompletePlayerResultSchema.safeParse({
        playerId: 9,
        outcome: 'skipped',
      }).success,
    ).toBe(false);
  });
});

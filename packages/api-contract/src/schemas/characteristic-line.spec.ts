import { describe, expect, it } from 'vitest';

import {
  CharacteristicLineSchema,
  PLAYER_CHARACTERISTIC_KEYS,
} from './characteristic-line';

const line = { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 };

describe('CharacteristicLineSchema', () => {
  it('parses a full line', () => {
    expect(CharacteristicLineSchema.parse(line)).toEqual(line);
  });

  it('accepts a null passing, meaning the rules set has no Passing characteristic', () => {
    expect(
      CharacteristicLineSchema.parse({ ...line, passing: null }).passing,
    ).toBeNull();
  });

  it.each(['move', 'strength', 'agility', 'armour'] as const)(
    'rejects a null %s',
    (key) => {
      expect(
        CharacteristicLineSchema.safeParse({ ...line, [key]: null }).success,
      ).toBe(false);
    },
  );

  it('requires passing to be stated, as null rather than omitted', () => {
    const withoutPassing: Partial<typeof line> = { ...line };
    delete withoutPassing.passing;
    expect(CharacteristicLineSchema.safeParse(withoutPassing).success).toBe(
      false,
    );
  });

  it('rejects a non-integer value', () => {
    expect(
      CharacteristicLineSchema.safeParse({ ...line, move: 6.5 }).success,
    ).toBe(false);
  });
});

describe('PLAYER_CHARACTERISTIC_KEYS', () => {
  it('lists exactly the schema keys, in stat-line order', () => {
    expect(PLAYER_CHARACTERISTIC_KEYS).toEqual(
      Object.keys(CharacteristicLineSchema.shape),
    );
  });
});

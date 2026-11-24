import { PLAYER_CHARACTERISTICS } from '@blood-bowl-tracker/domain-enums';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CharacteristicKey } from './characteristic-keys';
import {
  CHARACTERISTIC_KEY_BY_NAME,
  CHARACTERISTIC_KEYS,
  CHARACTERISTIC_NAME_BY_KEY,
} from './characteristic-keys';

describe('characteristic keys', () => {
  it('lists the lowercase keys in stat-line order', () => {
    expect(CHARACTERISTIC_KEYS).toEqual(['ma', 'st', 'ag', 'pa', 'av']);
  });

  it('maps every characteristic to its key and back', () => {
    for (const name of PLAYER_CHARACTERISTICS) {
      expect(CHARACTERISTIC_NAME_BY_KEY[CHARACTERISTIC_KEY_BY_NAME[name]]).toBe(
        name,
      );
    }
  });

  it('types CharacteristicKey as exactly the five keys', () => {
    expectTypeOf<CharacteristicKey>().toEqualTypeOf<
      'ma' | 'st' | 'ag' | 'pa' | 'av'
    >();
  });
});

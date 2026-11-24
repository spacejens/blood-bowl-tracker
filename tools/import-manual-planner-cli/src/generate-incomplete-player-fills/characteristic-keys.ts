import type { PlayerCharacteristic } from '@blood-bowl-tracker/domain-enums';
import { PLAYER_CHARACTERISTICS } from '@blood-bowl-tracker/domain-enums';

/**
 * Each characteristic's key in a fill entry and in the generator's rows: its
 * abbreviation in lower case. Typed against PLAYER_CHARACTERISTICS, so a
 * change to the canonical list fails compilation here.
 */
export const CHARACTERISTIC_KEY_BY_NAME = {
  MA: 'ma',
  ST: 'st',
  AG: 'ag',
  PA: 'pa',
  AV: 'av',
} as const satisfies { [C in PlayerCharacteristic]: Lowercase<C> };

export type CharacteristicKey =
  (typeof CHARACTERISTIC_KEY_BY_NAME)[PlayerCharacteristic];

/** The characteristic each key stands for. */
export const CHARACTERISTIC_NAME_BY_KEY = {
  ma: 'MA',
  st: 'ST',
  ag: 'AG',
  pa: 'PA',
  av: 'AV',
} as const satisfies { [K in CharacteristicKey]: Uppercase<K> };

/** The five keys, in stat-line order. */
export const CHARACTERISTIC_KEYS: readonly CharacteristicKey[] =
  PLAYER_CHARACTERISTICS.map((name) => CHARACTERISTIC_KEY_BY_NAME[name]);

/**
 * The named weather condition a TP `weather_roll` (code-10) event decodes to.
 * TP stores only an opaque integer; `weatherTypeByCode` maps each observed
 * code to its named condition, and any unmapped code decodes to `'unknown'`.
 */
export type WeatherType =
  | 'dungeon'
  | 'sweltering_heat'
  | 'very_sunny'
  | 'nice'
  | 'pouring_rain'
  | 'blizzard'
  | 'morning_dew'
  | 'blossoming_flowers'
  | 'misty_morning'
  | 'high_winds'
  | 'perfect_conditions'
  | 'melting_astrogranite'
  | 'blinding_rays'
  | 'monsoon'
  | 'leaf_strewn_pitch'
  | 'autumnal_chill'
  | 'strong_winds'
  | 'cold_winds'
  | 'freezing'
  | 'heavy_snow'
  | 'unknown';

/**
 * Exported for `match-event-parser.service.spec.ts`, so its weather-code
 * decode tests are driven directly off this map (every known code gets a
 * test case, with no risk of the two lists drifting apart).
 */
export const weatherTypeByCode: Record<number, WeatherType> = {
  0: 'dungeon',
  10: 'sweltering_heat',
  20: 'very_sunny',
  30: 'nice',
  40: 'pouring_rain',
  50: 'blizzard',
  100: 'morning_dew',
  101: 'blossoming_flowers',
  102: 'misty_morning',
  103: 'high_winds',
  104: 'perfect_conditions',
  105: 'melting_astrogranite',
  106: 'blinding_rays',
  107: 'monsoon',
  108: 'leaf_strewn_pitch',
  109: 'autumnal_chill',
  110: 'strong_winds',
  111: 'cold_winds',
  112: 'freezing',
  113: 'heavy_snow',
};

export function decodeWeatherType(code: number): WeatherType {
  return weatherTypeByCode[code] ?? 'unknown';
}

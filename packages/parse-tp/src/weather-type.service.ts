import { Injectable } from '@nestjs/common';

/**
 * The named weather condition a TP `weather_roll` (code-10) event decodes to.
 * TP stores only an opaque integer; `weatherTypeByTableAndCode` maps each
 * observed table/code pair to its named condition, and any unmapped
 * table/code decodes to `'unknown'`.
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
 * Weather codes are only unique within a weather table: TP's
 * `extraData.weatherTable` selects which table `extraData.weatherType` indexes
 * into. Table `0` is the classic table -- every code observed before Major
 * Season 30 -- and is also what an event with no `weatherTable` at all is
 * treated as. Later tables (e.g. `13`, first seen in Major Season 30) reuse
 * numbers in the same ranges for different conditions, so the lookup is
 * composite rather than by code alone.
 *
 * Exported for `weather-type.service.spec.ts`, so its decode tests are driven
 * directly off this map (every known table/code pair gets a test case, with no
 * risk of the two lists drifting apart).
 */
export const weatherTypeByTableAndCode: Record<
  number,
  Record<number, WeatherType>
> = {
  0: {
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
  },
};

@Injectable()
export class WeatherTypeService {
  decode(table: number, code: number): WeatherType {
    return weatherTypeByTableAndCode[table]?.[code] ?? 'unknown';
  }
}

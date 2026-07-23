import { describe, expect, it } from 'vitest';

import { weatherTypeByCode } from './weather-type';
import { WeatherTypeService } from './weather-type.service';

describe('WeatherTypeService', () => {
  const service = new WeatherTypeService();

  it.each(Object.entries(weatherTypeByCode))(
    'decodes code %s to %s',
    (code, expected) => {
      expect(service.decode(Number(code))).toBe(expected);
    },
  );

  it('decodes an unknown code to unknown', () => {
    expect(service.decode(999)).toBe('unknown');
  });
});

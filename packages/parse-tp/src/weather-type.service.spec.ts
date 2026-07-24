import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { weatherTypeByCode, WeatherTypeService } from './weather-type.service';

describe('WeatherTypeService', () => {
  let service: WeatherTypeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WeatherTypeService],
    }).compile();
    service = moduleRef.get(WeatherTypeService);
  });

  it.each(Object.entries(weatherTypeByCode))(
    'decodes code %s to %s',
    (code, expected) => {
      expect(service.decode(Number(code))).toBe(expected);
    },
  );

  it('decodes an unknown code to unknown', () => {
    expect(service.decode(999)).toBe('unknown');
  });

  it('has a decode test for every known weather code (guards against silent shrinkage of the code map)', () => {
    expect(Object.keys(weatherTypeByCode)).toHaveLength(20);
  });
});

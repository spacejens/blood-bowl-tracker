import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  weatherTypeByTableAndCode,
  WeatherTypeService,
} from './weather-type.service';

const tableCodePairs = Object.entries(weatherTypeByTableAndCode).flatMap(
  ([table, codes]) =>
    Object.entries(codes).map(
      ([code, expected]) => [table, code, expected] as const,
    ),
);

describe('WeatherTypeService', () => {
  let service: WeatherTypeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WeatherTypeService],
    }).compile();
    service = moduleRef.get(WeatherTypeService);
  });

  it.each(tableCodePairs)(
    'decodes table %s code %s to %s',
    (table, code, expected) => {
      expect(service.decode(Number(table), Number(code))).toBe(expected);
    },
  );

  it('decodes an unmapped code on a known table to unknown', () => {
    expect(service.decode(0, 999)).toBe('unknown');
  });

  it('decodes any code on an entirely unknown table to unknown', () => {
    expect(service.decode(99, 0)).toBe('unknown');
  });

  it('has a decode test for every classic-table weather code (guards against silent shrinkage of the code map)', () => {
    expect(Object.keys(weatherTypeByTableAndCode[0])).toHaveLength(20);
  });
});

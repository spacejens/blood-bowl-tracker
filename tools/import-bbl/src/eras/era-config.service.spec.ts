import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { EraConfigService } from './era-config.service';

function makeService(value: string | undefined): EraConfigService {
  const configService = {
    get: (_key: string) => value,
  } as unknown as ConfigService;
  return new EraConfigService(configService);
}

const validJson = JSON.stringify([
  {
    name: 'Living rulebook',
    rulesSet: 'Living rulebook',
    startDate: '2011-09-09',
    endDate: '2021-09-01',
  },
  {
    name: 'BB2020',
    rulesSet: 'BB2020',
    startDate: '2021-09-01',
  },
]);

describe('EraConfigService', () => {
  it('parses a valid BBL_ERAS array, leaving an omitted endDate undefined', () => {
    const eras = makeService(validJson).getEras();
    expect(eras).toHaveLength(2);
    expect(eras[0]).toEqual({
      name: 'Living rulebook',
      rulesSet: 'Living rulebook',
      startDate: '2011-09-09',
      endDate: '2021-09-01',
    });
    expect(eras[1].endDate).toBeUndefined();
  });

  it('throws when BBL_ERAS is not set', () => {
    expect(() => makeService(undefined).getEras()).toThrow('BBL_ERAS');
  });

  it('throws when BBL_ERAS is not valid JSON', () => {
    expect(() => makeService('{not json').getEras()).toThrow('BBL_ERAS');
  });

  it('throws when BBL_ERAS is not a non-empty array', () => {
    expect(() => makeService('[]').getEras()).toThrow('non-empty');
  });

  it('throws when an entry has an empty name', () => {
    const json = JSON.stringify([
      { name: '', rulesSet: 'BB2020', startDate: '2021-09-01' },
    ]);
    expect(() => makeService(json).getEras()).toThrow('name');
  });

  it('throws when an entry has an empty rulesSet', () => {
    const json = JSON.stringify([
      { name: 'BB2020', rulesSet: '', startDate: '2021-09-01' },
    ]);
    expect(() => makeService(json).getEras()).toThrow('rulesSet');
  });

  it('throws when startDate is missing', () => {
    const json = JSON.stringify([{ name: 'BB2020', rulesSet: 'BB2020' }]);
    expect(() => makeService(json).getEras()).toThrow('startDate');
  });

  it('throws when startDate is not an ISO date', () => {
    const json = JSON.stringify([
      { name: 'BB2020', rulesSet: 'BB2020', startDate: '01-09-2021' },
    ]);
    expect(() => makeService(json).getEras()).toThrow('startDate');
  });

  it('throws when startDate is not a real calendar date', () => {
    const json = JSON.stringify([
      { name: 'BB2020', rulesSet: 'BB2020', startDate: '2021-02-30' },
    ]);
    expect(() => makeService(json).getEras()).toThrow('startDate');
  });

  it('throws when endDate is present but not an ISO date', () => {
    const json = JSON.stringify([
      {
        name: 'BB2020',
        rulesSet: 'BB2020',
        startDate: '2021-09-01',
        endDate: 'later',
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow('endDate');
  });
});

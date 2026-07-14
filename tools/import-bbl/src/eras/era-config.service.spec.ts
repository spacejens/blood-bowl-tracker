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
    rulesSets: ['Living rulebook'],
    startDate: '2011-09-09',
    endDate: '2021-09-01',
    firstPlayerId: 1,
    lastPlayerId: 5000,
  },
  {
    name: 'BB2020',
    rulesSets: ['BB2020'],
    startDate: '2021-09-01',
    firstPlayerId: 5001,
  },
]);

describe('EraConfigService', () => {
  it('parses a valid BBL_ERAS array, leaving an omitted endDate/lastPlayerId undefined', () => {
    const eras = makeService(validJson).getEras();
    expect(eras).toHaveLength(2);
    expect(eras[0]).toEqual({
      name: 'Living rulebook',
      rulesSets: ['Living rulebook'],
      startDate: '2011-09-09',
      endDate: '2021-09-01',
      firstPlayerId: 1,
      lastPlayerId: 5000,
    });
    expect(eras[1].endDate).toBeUndefined();
    expect(eras[1].lastPlayerId).toBeUndefined();
    expect(eras[1].firstPlayerId).toBe(5001);
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
      { name: '', rulesSets: ['BB2020'], startDate: '2021-09-01' },
    ]);
    expect(() => makeService(json).getEras()).toThrow('name');
  });

  it('throws when an entry has an empty rulesSets array', () => {
    const json = JSON.stringify([
      { name: 'BB2020', rulesSets: [], startDate: '2021-09-01' },
    ]);
    expect(() => makeService(json).getEras()).toThrow('rulesSets');
  });

  it('accepts an era spanning multiple rules sets', () => {
    const json = JSON.stringify([
      {
        name: 'Living rulebook',
        rulesSets: ['CRP', 'CRP+', 'BB2016'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 1000,
      },
    ]);
    const eras = makeService(json).getEras();
    expect(eras[0].rulesSets).toEqual(['CRP', 'CRP+', 'BB2016']);
  });

  it('rejects an era whose rulesSets contains a non-string / empty entry', () => {
    const json = JSON.stringify([
      {
        name: 'X',
        rulesSets: [''],
        startDate: '2011-09-09',
        firstPlayerId: 1,
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow(/rulesSets/);
  });

  it('throws when startDate is missing', () => {
    const json = JSON.stringify([{ name: 'BB2020', rulesSets: ['BB2020'] }]);
    expect(() => makeService(json).getEras()).toThrow('startDate');
  });

  it('throws when startDate is not an ISO date', () => {
    const json = JSON.stringify([
      { name: 'BB2020', rulesSets: ['BB2020'], startDate: '01-09-2021' },
    ]);
    expect(() => makeService(json).getEras()).toThrow('startDate');
  });

  it('throws when startDate is not a real calendar date', () => {
    const json = JSON.stringify([
      { name: 'BB2020', rulesSets: ['BB2020'], startDate: '2021-02-30' },
    ]);
    expect(() => makeService(json).getEras()).toThrow('startDate');
  });

  it('throws when endDate is present but not an ISO date', () => {
    const json = JSON.stringify([
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        endDate: 'later',
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow('endDate');
  });

  it('throws when firstPlayerId is missing', () => {
    const json = JSON.stringify([
      { name: 'LRB', rulesSets: ['LRB'], startDate: '2011-09-09' },
    ]);
    expect(() => makeService(json).getEras()).toThrow(/firstPlayerId/);
  });

  it('parses an era with only firstPlayerId set (an era still ongoing has no lastPlayerId, mirroring endDate)', () => {
    const service = makeService(
      JSON.stringify([
        {
          name: 'LRB',
          rulesSets: ['LRB'],
          startDate: '2011-09-09',
          firstPlayerId: 1,
        },
      ]),
    );
    const era = service.getEras()[0];
    expect(era.firstPlayerId).toBe(1);
    expect(era.lastPlayerId).toBeUndefined();
    expect(era.endDate).toBeUndefined();
  });

  it('parses firstPlayerId and lastPlayerId when both present alongside endDate', () => {
    const service = makeService(
      JSON.stringify([
        {
          name: 'LRB',
          rulesSets: ['LRB'],
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          firstPlayerId: 1,
          lastPlayerId: 5000,
        },
      ]),
    );
    expect(service.getEras()[0]).toMatchObject({
      firstPlayerId: 1,
      lastPlayerId: 5000,
    });
  });

  it('rejects a non-positive-integer firstPlayerId', () => {
    const service = makeService(
      JSON.stringify([
        {
          name: 'LRB',
          rulesSets: ['LRB'],
          startDate: '2011-09-09',
          firstPlayerId: 0,
        },
      ]),
    );
    expect(() => service.getEras()).toThrow(/firstPlayerId/);
  });

  it('rejects a non-integer lastPlayerId', () => {
    const service = makeService(
      JSON.stringify([
        {
          name: 'LRB',
          rulesSets: ['LRB'],
          startDate: '2011-09-09',
          firstPlayerId: 1,
          lastPlayerId: 1.5,
        },
      ]),
    );
    expect(() => service.getEras()).toThrow(/lastPlayerId/);
  });

  it('rejects firstPlayerId greater than lastPlayerId', () => {
    const service = makeService(
      JSON.stringify([
        {
          name: 'LRB',
          rulesSets: ['LRB'],
          startDate: '2011-09-09',
          firstPlayerId: 10,
          lastPlayerId: 5,
        },
      ]),
    );
    expect(() => service.getEras()).toThrow(/firstPlayerId/);
  });

  it('throws when lastPlayerId is present but endDate is missing', () => {
    const json = JSON.stringify([
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        lastPlayerId: 5000,
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow(
      /endDate.*lastPlayerId|lastPlayerId.*endDate/,
    );
  });

  it('throws when endDate is present but lastPlayerId is missing', () => {
    const json = JSON.stringify([
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow(
      /endDate.*lastPlayerId|lastPlayerId.*endDate/,
    );
  });

  it('parses playerIdOverrides when present, leaving it undefined when absent', () => {
    const json = JSON.stringify([
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        playerIdOverrides: [4907, 4909],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
      },
    ]);
    const eras = makeService(json).getEras();
    expect(eras[0].playerIdOverrides).toEqual([4907, 4909]);
    expect(eras[1].playerIdOverrides).toBeUndefined();
  });

  it('rejects playerIdOverrides that is not an array', () => {
    const json = JSON.stringify([
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        playerIdOverrides: 4907,
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow(/playerIdOverrides/);
  });

  it('rejects playerIdOverrides containing a non-positive-integer', () => {
    const json = JSON.stringify([
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        playerIdOverrides: [4907, 0],
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow(/playerIdOverrides/);
  });

  it('rejects the same pid overridden into more than one era', () => {
    const json = JSON.stringify([
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        playerIdOverrides: [4907],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
        playerIdOverrides: [4907],
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow(/4907/);
  });

  it('parses competitionIdOverrides when present, leaving it undefined when absent', () => {
    const json = JSON.stringify([
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        competitionIdOverrides: ['74'],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
      },
    ]);
    const eras = makeService(json).getEras();
    expect(eras[0].competitionIdOverrides).toEqual(['74']);
    expect(eras[1].competitionIdOverrides).toBeUndefined();
  });

  it('rejects competitionIdOverrides that is not an array', () => {
    const json = JSON.stringify([
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        competitionIdOverrides: '74',
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow(/competitionIdOverrides/);
  });

  it('rejects competitionIdOverrides containing a non-string or empty string', () => {
    const json = JSON.stringify([
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        competitionIdOverrides: ['74', ''],
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow(/competitionIdOverrides/);
  });

  it('rejects the same competition id overridden into more than one era', () => {
    const json = JSON.stringify([
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        competitionIdOverrides: ['74'],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
        competitionIdOverrides: ['74'],
      },
    ]);
    expect(() => makeService(json).getEras()).toThrow(/74/);
  });
});

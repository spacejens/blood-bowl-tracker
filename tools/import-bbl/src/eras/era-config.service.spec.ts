import { describe, expect, it } from 'vitest';

import type { ImportBblConfigService } from '../config/import-bbl-config.service';
import { EraConfigService } from './era-config.service';

function makeService(eras: unknown): EraConfigService {
  const config = {
    get: (_key: string) => eras,
  } as unknown as ImportBblConfigService;
  return new EraConfigService(config);
}

const validEras = [
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
];

describe('EraConfigService', () => {
  it('parses a valid BBL_ERAS array, leaving an omitted endDate/lastPlayerId undefined', () => {
    const eras = makeService(validEras).getEras();
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

  it('throws when eras is not set', () => {
    expect(() => makeService(undefined).getEras()).toThrow(
      'eras is not set in import-bbl-config.json5',
    );
  });

  it('throws when eras is not a non-empty array', () => {
    expect(() => makeService([]).getEras()).toThrow('non-empty');
  });

  it('throws when an entry has an empty name', () => {
    const eras = [{ name: '', rulesSets: ['BB2020'], startDate: '2021-09-01' }];
    expect(() => makeService(eras).getEras()).toThrow('name');
  });

  it('throws when an entry has an empty rulesSets array', () => {
    const eras = [{ name: 'BB2020', rulesSets: [], startDate: '2021-09-01' }];
    expect(() => makeService(eras).getEras()).toThrow('rulesSets');
  });

  it('accepts an era spanning multiple rules sets', () => {
    const eras = [
      {
        name: 'Living rulebook',
        rulesSets: ['CRP', 'CRP+', 'BB2016'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 1000,
      },
    ];
    const result = makeService(eras).getEras();
    expect(result[0].rulesSets).toEqual(['CRP', 'CRP+', 'BB2016']);
  });

  it('rejects an era whose rulesSets contains a non-string / empty entry', () => {
    const eras = [
      {
        name: 'X',
        rulesSets: [''],
        startDate: '2011-09-09',
        firstPlayerId: 1,
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/rulesSets/);
  });

  it('throws when startDate is missing', () => {
    const eras = [{ name: 'BB2020', rulesSets: ['BB2020'] }];
    expect(() => makeService(eras).getEras()).toThrow('startDate');
  });

  it('throws when startDate is not an ISO date', () => {
    const eras = [
      { name: 'BB2020', rulesSets: ['BB2020'], startDate: '01-09-2021' },
    ];
    expect(() => makeService(eras).getEras()).toThrow('startDate');
  });

  it('throws when startDate is not a real calendar date', () => {
    const eras = [
      { name: 'BB2020', rulesSets: ['BB2020'], startDate: '2021-02-30' },
    ];
    expect(() => makeService(eras).getEras()).toThrow('startDate');
  });

  it('throws when endDate is present but not an ISO date', () => {
    const eras = [
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        endDate: 'later',
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow('endDate');
  });

  it('throws when firstPlayerId is missing', () => {
    const eras = [{ name: 'LRB', rulesSets: ['LRB'], startDate: '2011-09-09' }];
    expect(() => makeService(eras).getEras()).toThrow(/firstPlayerId/);
  });

  it('parses an era with only firstPlayerId set (an era still ongoing has no lastPlayerId, mirroring endDate)', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
      },
    ];
    const service = makeService(eras);
    const era = service.getEras()[0];
    expect(era.firstPlayerId).toBe(1);
    expect(era.lastPlayerId).toBeUndefined();
    expect(era.endDate).toBeUndefined();
  });

  it('parses firstPlayerId and lastPlayerId when both present alongside endDate', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
      },
    ];
    const service = makeService(eras);
    expect(service.getEras()[0]).toMatchObject({
      firstPlayerId: 1,
      lastPlayerId: 5000,
    });
  });

  it('rejects a non-positive-integer firstPlayerId', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 0,
      },
    ];
    const service = makeService(eras);
    expect(() => service.getEras()).toThrow(/firstPlayerId/);
  });

  it('rejects a non-integer lastPlayerId', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        lastPlayerId: 1.5,
      },
    ];
    const service = makeService(eras);
    expect(() => service.getEras()).toThrow(/lastPlayerId/);
  });

  it('rejects firstPlayerId greater than lastPlayerId', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 10,
        lastPlayerId: 5,
      },
    ];
    const service = makeService(eras);
    expect(() => service.getEras()).toThrow(/firstPlayerId/);
  });

  it('throws when lastPlayerId is present but endDate is missing', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        lastPlayerId: 5000,
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(
      /endDate.*lastPlayerId|lastPlayerId.*endDate/,
    );
  });

  it('throws when endDate is present but lastPlayerId is missing', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(
      /endDate.*lastPlayerId|lastPlayerId.*endDate/,
    );
  });

  it('parses playerIdOverrides when present, leaving it undefined when absent', () => {
    const eras = [
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
    ];
    const result = makeService(eras).getEras();
    expect(result[0].playerIdOverrides).toEqual([4907, 4909]);
    expect(result[1].playerIdOverrides).toBeUndefined();
  });

  it('rejects playerIdOverrides that is not an array', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        playerIdOverrides: 4907,
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/playerIdOverrides/);
  });

  it('rejects playerIdOverrides containing a non-positive-integer', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        playerIdOverrides: [4907, 0],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/playerIdOverrides/);
  });

  it('rejects the same pid overridden into more than one era', () => {
    const eras = [
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
    ];
    expect(() => makeService(eras).getEras()).toThrow(/4907/);
  });

  it('parses seasonCompetitionIdOverrides when present, leaving it undefined when absent', () => {
    const eras = [
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        seasonCompetitionIdOverrides: ['74'],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
      },
    ];
    const result = makeService(eras).getEras();
    expect(result[0].seasonCompetitionIdOverrides).toEqual(['74']);
    expect(result[1].seasonCompetitionIdOverrides).toBeUndefined();
  });

  it('rejects seasonCompetitionIdOverrides that is not an array', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        seasonCompetitionIdOverrides: '74',
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(
      /seasonCompetitionIdOverrides/,
    );
  });

  it('rejects seasonCompetitionIdOverrides containing a non-string or empty string', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        seasonCompetitionIdOverrides: ['74', ''],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(
      /seasonCompetitionIdOverrides/,
    );
  });

  it('rejects the same competition id overridden into more than one era', () => {
    const eras = [
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        seasonCompetitionIdOverrides: ['74'],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
        seasonCompetitionIdOverrides: ['74'],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/74/);
  });

  it('parses cupCompetitionIdOverrides when present, leaving it undefined when absent', () => {
    const eras = [
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        cupCompetitionIdOverrides: ['30', '33'],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
      },
    ];
    const result = makeService(eras).getEras();
    expect(result[0].cupCompetitionIdOverrides).toEqual(['30', '33']);
    expect(result[1].cupCompetitionIdOverrides).toBeUndefined();
  });

  it('rejects cupCompetitionIdOverrides that is not an array of non-empty strings', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        cupCompetitionIdOverrides: ['30', ''],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(
      /cupCompetitionIdOverrides/,
    );
  });

  it('rejects the same competition id appearing across season and cup overrides in different eras', () => {
    const eras = [
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        seasonCompetitionIdOverrides: ['30'],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
        cupCompetitionIdOverrides: ['30'],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/30/);
  });

  it('rejects the same competition id appearing in both season and cup overrides of the same era', () => {
    const eras = [
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        seasonCompetitionIdOverrides: ['30'],
        cupCompetitionIdOverrides: ['30'],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/30/);
  });

  it('parses teamCodeOverrides when present, leaving it undefined when absent', () => {
    const eras = [
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        teamCodeOverrides: ['rad', 'sl-'],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
      },
    ];
    const result = makeService(eras).getEras();
    expect(result[0].teamCodeOverrides).toEqual(['rad', 'sl-']);
    expect(result[1].teamCodeOverrides).toBeUndefined();
  });

  it('rejects teamCodeOverrides that is not an array of non-empty strings', () => {
    const eras = [
      {
        name: 'LRB',
        rulesSets: ['LRB'],
        startDate: '2011-09-09',
        firstPlayerId: 1,
        teamCodeOverrides: ['rad', ''],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/teamCodeOverrides/);
  });

  it('rejects the same team code overridden into more than one era', () => {
    const eras = [
      {
        name: 'Living rulebook',
        rulesSets: ['Living rulebook'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
        teamCodeOverrides: ['rad'],
      },
      {
        name: 'BB2020',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
        teamCodeOverrides: ['rad'],
      },
    ];
    expect(() => makeService(eras).getEras()).toThrow(/rad/);
  });
});

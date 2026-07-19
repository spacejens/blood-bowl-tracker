import { describe, expect, it } from 'vitest';

import type { ImportTpConfigService } from '../config/import-tp-config.service';
import { EraDataConfigService } from './era-data-config.service';

function makeService(league: unknown): EraDataConfigService {
  const config = {
    get: (key: string) => (key === 'league' ? league : undefined),
  } as unknown as ImportTpConfigService;
  return new EraDataConfigService(config);
}

const validLeague = {
  name: 'tLoEGBBL',
  eras: [
    {
      identity: { name: 'Third era', rulesSets: ['LRB6'] },
      dates: { startDate: '2013-01-01', endDate: '2016-12-31' },
      dataSubdir: 'third-era',
    },
    {
      identity: { name: 'Fourth era', rulesSets: ['BB2020'] },
      dates: { startDate: '2020-11-28' },
      dataSubdir: 'fourth-era',
    },
  ],
};

describe('EraDataConfigService', () => {
  it('parses a valid league.eras array into a flat shape', () => {
    expect(makeService(validLeague).getEras()).toEqual([
      {
        name: 'Third era',
        dataSubdir: 'third-era',
        rulesSets: ['LRB6'],
        startDate: '2013-01-01',
        endDate: '2016-12-31',
      },
      {
        name: 'Fourth era',
        dataSubdir: 'fourth-era',
        rulesSets: ['BB2020'],
        startDate: '2020-11-28',
      },
    ]);
  });

  it('throws when league is not set', () => {
    expect(() => makeService(undefined).getEras()).toThrow(
      'league.eras is not set in import-tp-config.json5',
    );
  });

  it('throws when league.eras is not a non-empty array', () => {
    expect(() => makeService({ name: 'x', eras: [] }).getEras()).toThrow(
      'non-empty',
    );
  });

  it('throws when an entry is not an object', () => {
    expect(() =>
      makeService({ name: 'x', eras: ['third-era'] }).getEras(),
    ).toThrow('TP_ERAS[0] must be an object');
  });

  it('throws when identity is not an object', () => {
    expect(() =>
      makeService({
        name: 'x',
        eras: [
          {
            identity: 'x',
            dates: { startDate: '2013-01-01' },
            dataSubdir: 'third-era',
          },
        ],
      }).getEras(),
    ).toThrow('TP_ERAS[0].identity must be an object');
  });

  it('throws when identity.name is empty', () => {
    expect(() =>
      makeService({
        name: 'x',
        eras: [
          {
            identity: { name: '', rulesSets: ['LRB6'] },
            dates: { startDate: '2013-01-01' },
            dataSubdir: 'third-era',
          },
        ],
      }).getEras(),
    ).toThrow('TP_ERAS[0].identity.name must be a non-empty string');
  });

  it('throws when identity.rulesSets is missing or empty', () => {
    expect(() =>
      makeService({
        name: 'x',
        eras: [
          {
            identity: { name: 'Third era', rulesSets: [] },
            dates: { startDate: '2013-01-01' },
            dataSubdir: 'third-era',
          },
        ],
      }).getEras(),
    ).toThrow(
      'TP_ERAS[0].identity.rulesSets must be a non-empty array of non-empty strings',
    );
  });

  it('throws when dates is not an object', () => {
    expect(() =>
      makeService({
        name: 'x',
        eras: [
          {
            identity: { name: 'Third era', rulesSets: ['LRB6'] },
            dates: null,
            dataSubdir: 'third-era',
          },
        ],
      }).getEras(),
    ).toThrow('TP_ERAS[0].dates must be an object');
  });

  it('throws when dates.startDate is missing or not an ISO date', () => {
    expect(() =>
      makeService({
        name: 'x',
        eras: [
          {
            identity: { name: 'Third era', rulesSets: ['LRB6'] },
            dates: { startDate: '01-01-2013' },
            dataSubdir: 'third-era',
          },
        ],
      }).getEras(),
    ).toThrow('TP_ERAS[0].dates.startDate must be an ISO date (YYYY-MM-DD)');
  });

  it('throws when dates.endDate is present but not an ISO date', () => {
    expect(() =>
      makeService({
        name: 'x',
        eras: [
          {
            identity: { name: 'Third era', rulesSets: ['LRB6'] },
            dates: { startDate: '2013-01-01', endDate: 'nope' },
            dataSubdir: 'third-era',
          },
        ],
      }).getEras(),
    ).toThrow(
      'TP_ERAS[0].dates.endDate must be an ISO date (YYYY-MM-DD) when present',
    );
  });

  it('throws when dataSubdir is empty', () => {
    expect(() =>
      makeService({
        name: 'x',
        eras: [
          {
            identity: { name: 'Third era', rulesSets: ['LRB6'] },
            dates: { startDate: '2013-01-01' },
            dataSubdir: '',
          },
        ],
      }).getEras(),
    ).toThrow('TP_ERAS[0].dataSubdir must be a non-empty string');
  });

  it('throws when two entries share the same name', () => {
    expect(() =>
      makeService({
        name: 'x',
        eras: [
          {
            identity: { name: 'Third era', rulesSets: ['LRB6'] },
            dates: { startDate: '2013-01-01' },
            dataSubdir: 'third-era',
          },
          {
            identity: { name: 'Third era', rulesSets: ['LRB6'] },
            dates: { startDate: '2016-01-01' },
            dataSubdir: 'other',
          },
        ],
      }).getEras(),
    ).toThrow('TP_ERAS: era name "Third era" appears more than once');
  });

  it('throws when two entries share the same dataSubdir', () => {
    expect(() =>
      makeService({
        name: 'x',
        eras: [
          {
            identity: { name: 'Third era', rulesSets: ['LRB6'] },
            dates: { startDate: '2013-01-01' },
            dataSubdir: 'third-era',
          },
          {
            identity: { name: 'Other', rulesSets: ['LRB6'] },
            dates: { startDate: '2016-01-01' },
            dataSubdir: 'third-era',
          },
        ],
      }).getEras(),
    ).toThrow('TP_ERAS: dataSubdir "third-era" appears more than once');
  });
});

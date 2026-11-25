import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ImportTpConfigService } from '../config/import-tp-config.service';
import { EraDataConfigService } from './era-data-config.service';

const validLeague = {
  name: 'tLoEG',
  eras: [
    { identity: { name: 'Third era' }, dataSubdir: 'third-era' },
    { identity: { name: 'Fourth era' }, dataSubdir: 'fourth-era' },
  ],
};

describe('EraDataConfigService', () => {
  let config: MockProxy<ImportTpConfigService>;
  let service: EraDataConfigService;

  beforeEach(async () => {
    config = mock<ImportTpConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EraDataConfigService,
        { provide: ImportTpConfigService, useValue: config },
        // Real, not mocked: a pure, dependency-free formatting service whose
        // exact output is what this spec's error assertions check.
        ConfigErrorMessageService,
      ],
    }).compile();
    service = moduleRef.get(EraDataConfigService);
  });

  function withLeague(league: unknown): void {
    config.get.mockImplementation((key: string) =>
      key === 'league' ? league : undefined,
    );
  }

  it('parses a valid league.eras array into a flat shape', () => {
    withLeague(validLeague);
    expect(service.getEras()).toEqual([
      { name: 'Third era', dataSubdir: 'third-era' },
      { name: 'Fourth era', dataSubdir: 'fourth-era' },
    ]);
  });

  it('still loads an era carrying the stale rulesSets and dates keys, ignoring them', () => {
    withLeague({
      name: 'tLoEG',
      eras: [
        {
          identity: { name: 'Third era', rulesSets: ['LRB6'] },
          dates: { startDate: '2013-01-01', endDate: '2016-12-31' },
          dataSubdir: 'third-era',
        },
      ],
    });
    expect(service.getEras()).toEqual([
      { name: 'Third era', dataSubdir: 'third-era' },
    ]);
  });

  it('throws when league is not set', () => {
    withLeague(undefined);
    expect(() => service.getEras()).toThrow(
      'league.eras is not set in import-tp-config.json5',
    );
  });

  it('throws when league.eras is not a non-empty array', () => {
    withLeague({ name: 'x', eras: [] });
    expect(() => service.getEras()).toThrow('non-empty');
  });

  it('throws when an entry is not an object', () => {
    withLeague({ name: 'x', eras: ['third-era'] });
    expect(() => service.getEras()).toThrow('TP_ERAS[0] must be an object');
  });

  it('throws when identity is not an object', () => {
    withLeague({
      name: 'x',
      eras: [{ identity: 'x', dataSubdir: 'third-era' }],
    });
    expect(() => service.getEras()).toThrow(
      'TP_ERAS[0].identity must be an object',
    );
  });

  it('throws when identity.name is empty', () => {
    withLeague({
      name: 'x',
      eras: [{ identity: { name: '' }, dataSubdir: 'third-era' }],
    });
    expect(() => service.getEras()).toThrow(
      'TP_ERAS[0].identity.name must be a non-empty string',
    );
  });

  it('throws when dataSubdir is empty', () => {
    withLeague({
      name: 'x',
      eras: [{ identity: { name: 'Third era' }, dataSubdir: '' }],
    });
    expect(() => service.getEras()).toThrow(
      'TP_ERAS[0].dataSubdir must be a non-empty string',
    );
  });

  it('throws when two entries share the same name', () => {
    withLeague({
      name: 'x',
      eras: [
        { identity: { name: 'Third era' }, dataSubdir: 'third-era' },
        { identity: { name: 'Third era' }, dataSubdir: 'other' },
      ],
    });
    expect(() => service.getEras()).toThrow(
      'TP_ERAS: era name "Third era" appears more than once',
    );
  });

  it('throws when two entries share the same dataSubdir', () => {
    withLeague({
      name: 'x',
      eras: [
        { identity: { name: 'Third era' }, dataSubdir: 'third-era' },
        { identity: { name: 'Other' }, dataSubdir: 'third-era' },
      ],
    });
    expect(() => service.getEras()).toThrow(
      'TP_ERAS: dataSubdir "third-era" appears more than once',
    );
  });
});

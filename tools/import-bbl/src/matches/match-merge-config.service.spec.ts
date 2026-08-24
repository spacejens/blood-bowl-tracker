import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { EraConfig } from '../eras/era-config.service';
import { EraConfigService } from '../eras/era-config.service';
import { MatchMergeConfigService } from './match-merge-config.service';

/** Build a minimal EraConfig carrying only the fields getMerges() reads. */
function era(name: string, merges?: unknown[]): EraConfig {
  return {
    identity: { name, rulesSets: ['X'] },
    dates: { startDate: '2011-09-09', autoAssignByDate: true },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
    ...(merges !== undefined ? { matches: { merges } } : {}),
  };
}

async function makeService(
  eras: EraConfig[],
): Promise<MatchMergeConfigService> {
  const eraConfig = mock<EraConfigService>();
  eraConfig.getEras.mockReturnValue(eras);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchMergeConfigService,
      { provide: EraConfigService, useValue: eraConfig },
      // ConfigErrorMessageService is passed real, not mocked — pure, dependency-free, per CLAUDE.md.
      ConfigErrorMessageService,
    ],
  }).compile();
  return moduleRef.get(MatchMergeConfigService);
}

describe('MatchMergeConfigService', () => {
  it('returns no pairs when no era has a matches group', async () => {
    const service = await makeService([era('First')]);
    expect(service.getMerges()).toEqual([]);
  });

  it('returns no pairs when an era has an empty merges array', async () => {
    const service = await makeService([era('First', [])]);
    expect(service.getMerges()).toEqual([]);
  });

  it('parses a valid array of pairs from a single era', async () => {
    const service = await makeService([
      era('First', [
        ['1061', '1062'],
        ['1311', '1312'],
      ]),
    ]);
    expect(service.getMerges()).toEqual([
      { firstMatchId: '1061', secondMatchId: '1062' },
      { firstMatchId: '1311', secondMatchId: '1312' },
    ]);
  });

  it('flattens merges spread across more than one era', async () => {
    const service = await makeService([
      era('First', [['1061', '1062']]),
      era('Second', [['2001', '2002']]),
    ]);
    expect(service.getMerges()).toEqual([
      { firstMatchId: '1061', secondMatchId: '1062' },
      { firstMatchId: '2001', secondMatchId: '2002' },
    ]);
  });

  it('throws when an entry is not a 2-element array', async () => {
    const service1 = await makeService([era('First', [['1061']])]);
    expect(() => service1.getMerges()).toThrow('BBL_ERAS[0].matches.merges[0]');
    const service2 = await makeService([
      era('First', [['1061', '1062', '1063']]),
    ]);
    expect(() => service2.getMerges()).toThrow('BBL_ERAS[0].matches.merges[0]');
  });

  it('throws when an entry contains a non-string or empty id', async () => {
    const service1 = await makeService([era('First', [[1061, 1062]])]);
    expect(() => service1.getMerges()).toThrow('BBL_ERAS[0].matches.merges[0]');
    const service2 = await makeService([era('First', [['1061', '']])]);
    expect(() => service2.getMerges()).toThrow('BBL_ERAS[0].matches.merges[0]');
  });

  it('throws when a pair contains the same id twice', async () => {
    const service = await makeService([era('First', [['1061', '1061']])]);
    expect(() => service.getMerges()).toThrow('1061');
  });

  it('throws when an id appears in more than one pair within an era', async () => {
    const service = await makeService([
      era('First', [
        ['1061', '1062'],
        ['1062', '1063'],
      ]),
    ]);
    expect(() => service.getMerges()).toThrow('1062');
  });

  it('throws when an id appears in pairs across different eras', async () => {
    const service = await makeService([
      era('First', [['1061', '1062']]),
      era('Second', [['1062', '2002']]),
    ]);
    expect(() => service.getMerges()).toThrow('1062');
  });
});

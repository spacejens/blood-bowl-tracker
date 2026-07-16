import { describe, expect, it } from 'vitest';

import type { EraConfig, EraConfigService } from '../eras/era-config.service';
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

function makeService(eras: EraConfig[]): MatchMergeConfigService {
  const eraConfig = {
    getEras: () => eras,
  } as unknown as EraConfigService;
  return new MatchMergeConfigService(eraConfig);
}

describe('MatchMergeConfigService', () => {
  it('returns no pairs when no era has a matches group', () => {
    expect(makeService([era('First')]).getMerges()).toEqual([]);
  });

  it('returns no pairs when an era has an empty merges array', () => {
    expect(makeService([era('First', [])]).getMerges()).toEqual([]);
  });

  it('parses a valid array of pairs from a single era', () => {
    const service = makeService([
      era('First', [
        ['1061', '1062'],
        ['1311', '1312'],
      ]),
    ]);
    expect(service.getMerges()).toEqual([
      ['1061', '1062'],
      ['1311', '1312'],
    ]);
  });

  it('flattens merges spread across more than one era', () => {
    const service = makeService([
      era('First', [['1061', '1062']]),
      era('Second', [['2001', '2002']]),
    ]);
    expect(service.getMerges()).toEqual([
      ['1061', '1062'],
      ['2001', '2002'],
    ]);
  });

  it('throws when an entry is not a 2-element array', () => {
    expect(() => makeService([era('First', [['1061']])]).getMerges()).toThrow(
      'BBL_ERAS[0].matches.merges[0]',
    );
    expect(() =>
      makeService([era('First', [['1061', '1062', '1063']])]).getMerges(),
    ).toThrow('BBL_ERAS[0].matches.merges[0]');
  });

  it('throws when an entry contains a non-string or empty id', () => {
    expect(() =>
      makeService([era('First', [[1061, 1062]])]).getMerges(),
    ).toThrow('BBL_ERAS[0].matches.merges[0]');
    expect(() =>
      makeService([era('First', [['1061', '']])]).getMerges(),
    ).toThrow('BBL_ERAS[0].matches.merges[0]');
  });

  it('throws when a pair contains the same id twice', () => {
    expect(() =>
      makeService([era('First', [['1061', '1061']])]).getMerges(),
    ).toThrow('1061');
  });

  it('throws when an id appears in more than one pair within an era', () => {
    expect(() =>
      makeService([
        era('First', [
          ['1061', '1062'],
          ['1062', '1063'],
        ]),
      ]).getMerges(),
    ).toThrow('1062');
  });

  it('throws when an id appears in pairs across different eras', () => {
    expect(() =>
      makeService([
        era('First', [['1061', '1062']]),
        era('Second', [['1062', '2002']]),
      ]).getMerges(),
    ).toThrow('1062');
  });
});

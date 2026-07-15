import { describe, expect, it } from 'vitest';

import type { ImportBblConfigService } from '../config/import-bbl-config.service';
import { MatchMergeConfigService } from './match-merge-config.service';

function makeService(merges: unknown): MatchMergeConfigService {
  const config = {
    get: (_key: string) => merges,
  } as unknown as ImportBblConfigService;
  return new MatchMergeConfigService(config);
}

describe('MatchMergeConfigService', () => {
  it('returns no pairs when matchMerges is unset', () => {
    expect(makeService(undefined).getMerges()).toEqual([]);
  });

  it('returns no pairs when matchMerges is an empty array', () => {
    expect(makeService([]).getMerges()).toEqual([]);
  });

  it('parses a valid array of pairs', () => {
    const service = makeService([
      ['1061', '1062'],
      ['1311', '1312'],
    ]);
    expect(service.getMerges()).toEqual([
      ['1061', '1062'],
      ['1311', '1312'],
    ]);
  });

  it('throws when matchMerges is not an array', () => {
    expect(() => makeService({ a: 1 }).getMerges()).toThrow(
      'matchMerges in import-bbl-config.json5',
    );
  });

  it('throws when an entry is not a 2-element array', () => {
    expect(() => makeService([['1061']]).getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
    expect(() => makeService([['1061', '1062', '1063']]).getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
  });

  it('throws when an entry contains a non-string or empty id', () => {
    expect(() => makeService([[1061, 1062]]).getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
    expect(() => makeService([['1061', '']]).getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
  });

  it('throws when a pair contains the same id twice', () => {
    expect(() => makeService([['1061', '1061']]).getMerges()).toThrow('1061');
  });

  it('throws when an id appears in more than one pair', () => {
    expect(() =>
      makeService([
        ['1061', '1062'],
        ['1062', '1063'],
      ]).getMerges(),
    ).toThrow('1062');
  });
});

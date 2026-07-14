import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { MatchMergeConfigService } from './match-merge-config.service';

function makeService(value: string | undefined): MatchMergeConfigService {
  const configService = {
    get: (_key: string) => value,
  } as unknown as ConfigService;
  return new MatchMergeConfigService(configService);
}

describe('MatchMergeConfigService', () => {
  it('returns no pairs when BBL_MATCH_MERGES is unset', () => {
    expect(makeService(undefined).getMerges()).toEqual([]);
  });

  it('returns no pairs when BBL_MATCH_MERGES is an empty string', () => {
    expect(makeService('').getMerges()).toEqual([]);
  });

  it('returns no pairs when BBL_MATCH_MERGES is an empty JSON array', () => {
    expect(makeService('[]').getMerges()).toEqual([]);
  });

  it('parses a valid array of pairs', () => {
    const service = makeService('[["1061","1062"],["1311","1312"]]');
    expect(service.getMerges()).toEqual([
      ['1061', '1062'],
      ['1311', '1312'],
    ]);
  });

  it('throws when BBL_MATCH_MERGES is not valid JSON', () => {
    expect(() => makeService('[not json').getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
  });

  it('throws when BBL_MATCH_MERGES is not a JSON array', () => {
    expect(() => makeService('{"a":1}').getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
  });

  it('throws when an entry is not a 2-element array', () => {
    expect(() => makeService('[["1061"]]').getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
    expect(() => makeService('[["1061","1062","1063"]]').getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
  });

  it('throws when an entry contains a non-string or empty id', () => {
    expect(() => makeService('[[1061,1062]]').getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
    expect(() => makeService('[["1061",""]]').getMerges()).toThrow(
      'BBL_MATCH_MERGES',
    );
  });

  it('throws when a pair contains the same id twice', () => {
    expect(() => makeService('[["1061","1061"]]').getMerges()).toThrow('1061');
  });

  it('throws when an id appears in more than one pair', () => {
    expect(() =>
      makeService('[["1061","1062"],["1062","1063"]]').getMerges(),
    ).toThrow('1062');
  });
});

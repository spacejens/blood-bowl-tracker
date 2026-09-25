import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpMatchPathsService } from './tp-match-paths.service';

describe('TpMatchPathsService', () => {
  let paths: TpMatchPathsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpMatchPathsService],
    }).compile();
    paths = moduleRef.get(TpMatchPathsService);
  });

  it("builds a match's API path", () => {
    expect(paths.apiPath(576264)).toBe('match/576264');
    expect(paths.apiPath('576264')).toBe('match/576264');
  });

  it("builds a match's page path under its tournament", () => {
    expect(paths.frontendPath('s30', 576264)).toBe('s30/match/576264');
  });

  describe('matchFrontendPath', () => {
    it("extracts the tournament slug and match id from a match's page path", () => {
      expect(paths.matchFrontendPath('s30/match/576264')).toEqual({
        tournamentSlug: 's30',
        matchId: 576264,
      });
    });

    it('round-trips its own frontendPath', () => {
      expect(
        paths.matchFrontendPath(paths.frontendPath('nordic-cup', 7)),
      ).toEqual({ tournamentSlug: 'nordic-cup', matchId: 7 });
    });

    it.each([
      ['a non-numeric id', 's30/match/abc'],
      ['a zero id', 's30/match/0'],
      ['a leading-zero id', 's30/match/0576264'],
      ['an id beyond the safe integer range', 's30/match/99999999999999999999'],
      ['a missing id', 's30/match'],
      ['an empty id', 's30/match/'],
      ['a missing slug', 'match/576264'],
      ['an empty slug', '/match/576264'],
      ['an extra segment', 's30/match/576264/extra'],
      ['a differently-cased marker', 's30/Match/576264'],
      ['a different marker', 's30/matches/576264'],
      ['an empty path', ''],
    ])('does not match %s', (_label, path) => {
      expect(paths.matchFrontendPath(path)).toBeUndefined();
    });
  });
});

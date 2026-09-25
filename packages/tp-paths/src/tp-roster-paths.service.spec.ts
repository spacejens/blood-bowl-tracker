import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpRosterPathsService } from './tp-roster-paths.service';

describe('TpRosterPathsService', () => {
  let paths: TpRosterPathsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRosterPathsService],
    }).compile();
    paths = moduleRef.get(TpRosterPathsService);
  });

  it("builds a roster's API path", () => {
    expect(paths.apiPath(163386)).toBe('rosters/163386');
    expect(paths.apiPath('r7')).toBe('rosters/r7');
  });

  it("builds a roster's frontend page path", () => {
    expect(paths.frontendPath(163386)).toBe('roster/163386');
  });

  describe('matchFrontendPath', () => {
    it("extracts the roster id from a roster's page path", () => {
      expect(paths.matchFrontendPath('roster/163386')).toBe(163386);
    });

    it('round-trips its own frontendPath', () => {
      expect(paths.matchFrontendPath(paths.frontendPath(42))).toBe(42);
    });

    it.each([
      ['a non-numeric id', 'roster/abc'],
      ['a zero id', 'roster/0'],
      ['a leading-zero id', 'roster/0123'],
      ['a negative id', 'roster/-5'],
      ['an id beyond the safe integer range', 'roster/99999999999999999999'],
      ['a missing id', 'roster'],
      ['an empty id', 'roster/'],
      ['an extra segment', 'roster/163386/extra'],
      ['a different first segment', 'rosters/163386'],
      ['a differently-cased first segment', 'Roster/163386'],
      ['an empty path', ''],
    ])('does not match %s', (_label, path) => {
      expect(paths.matchFrontendPath(path)).toBeUndefined();
    });
  });
});

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpMatchPathsService } from './tp-match-paths.service';
import { TpOfficialTeamsPathsService } from './tp-official-teams-paths.service';
import { TpPageClassifierService } from './tp-page-classifier.service';
import { TpRosterPathsService } from './tp-roster-paths.service';
import { TpTournamentPathsService } from './tp-tournament-paths.service';

// The four path services are passed real: each is a pure, dependency-free
// decision service (no constructor, no I/O, no external state), so there is
// no behavior to drift from, and passing them real is what verifies the
// classifier's ordering and reserved-segment guard against the real shapes.
describe('TpPageClassifierService', () => {
  const BASE = 'https://tourplay.net/en/blood-bowl/';
  let classifier: TpPageClassifierService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPageClassifierService,
        TpMatchPathsService,
        TpOfficialTeamsPathsService,
        TpRosterPathsService,
        TpTournamentPathsService,
      ],
    }).compile();
    classifier = moduleRef.get(TpPageClassifierService);
  });

  describe('recognized pages', () => {
    it('classifies a roster page', () => {
      expect(classifier.classify(`${BASE}roster/163386`, BASE)).toEqual({
        kind: 'roster',
        rosterId: 163386,
      });
    });

    it('classifies the official teams page', () => {
      expect(classifier.classify(`${BASE}teams`, BASE)).toEqual({
        kind: 'officialTeams',
      });
    });

    it('classifies a match page', () => {
      expect(classifier.classify(`${BASE}s30/match/576264`, BASE)).toEqual({
        kind: 'match',
        tournamentSlug: 's30',
        matchId: 576264,
      });
    });

    it("classifies a competition's bare page", () => {
      expect(classifier.classify(`${BASE}s30`, BASE)).toEqual({
        kind: 'competition',
        tournamentSlug: 's30',
      });
    });

    it.each(['scores', 'rules', 'news'])(
      "classifies a competition's %s page",
      (page) => {
        expect(classifier.classify(`${BASE}s30/${page}`, BASE)).toEqual({
          kind: 'competition',
          tournamentSlug: 's30',
        });
      },
    );
  });

  describe('URL normalization', () => {
    it('ignores a trailing slash', () => {
      expect(classifier.classify(`${BASE}roster/163386/`, BASE)).toEqual({
        kind: 'roster',
        rosterId: 163386,
      });
    });

    it('ignores a query string and a fragment', () => {
      expect(
        classifier.classify(`${BASE}s30/match/576264?utm_source=x#top`, BASE),
      ).toEqual({ kind: 'match', tournamentSlug: 's30', matchId: 576264 });
    });

    it('accepts a base URL given without its trailing slash', () => {
      expect(
        classifier.classify(
          `${BASE}teams`,
          'https://tourplay.net/en/blood-bowl',
        ),
      ).toEqual({ kind: 'officialTeams' });
    });

    it("ignores the host's letter case", () => {
      expect(
        classifier.classify('https://TourPlay.net/en/blood-bowl/teams', BASE),
      ).toEqual({ kind: 'officialTeams' });
    });
  });

  describe('unknown', () => {
    it.each([
      ['a malformed URL', 'not a url'],
      ['an empty string', ''],
      ['a different host', 'https://example.com/en/blood-bowl/s30'],
      ['a different scheme', 'http://tourplay.net/en/blood-bowl/s30'],
      ['a different base path', 'https://tourplay.net/es/blood-bowl/s30'],
      [
        'a base path prefix without its separator',
        'https://tourplay.net/en/blood-bowlx/s30',
      ],
      ['the base URL itself', BASE],
      [
        'the base URL without its trailing slash',
        'https://tourplay.net/en/blood-bowl',
      ],
      ['a roster page with a non-numeric id', `${BASE}roster/abc`],
      ['a roster page with no id', `${BASE}roster`],
      ['the teams page with an extra segment', `${BASE}teams/25`],
      ['a match page with a non-numeric id', `${BASE}s30/match/abc`],
      ['a match page with no id', `${BASE}s30/match`],
      ['a match page with an extra segment', `${BASE}s30/match/576264/extra`],
      ['a path with an empty leading segment', `${BASE}/s30`],
    ])('for %s', (_label, url) => {
      expect(classifier.classify(url, BASE)).toEqual({ kind: 'unknown' });
    });

    it('for a malformed base URL', () => {
      expect(classifier.classify(`${BASE}s30`, 'not a url')).toEqual({
        kind: 'unknown',
      });
    });
  });
});

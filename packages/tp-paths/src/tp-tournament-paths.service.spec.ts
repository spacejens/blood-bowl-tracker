import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TpBaseUrls, TpRequest } from './tp-request';
import { TpTournamentPathsService } from './tp-tournament-paths.service';

const BACKEND = 'https://tp.example/api/';
const FRONTEND = 'https://tp.example/blood-bowl/';

describe('TpTournamentPathsService', () => {
  let paths: TpTournamentPathsService;
  let baseUrls: TpBaseUrls;

  beforeEach(async () => {
    baseUrls = {
      getBackendApiUrl: () => BACKEND,
      getFrontendBaseUrl: () => FRONTEND,
    };
    const moduleRef = await Test.createTestingModule({
      providers: [TpTournamentPathsService],
    }).compile();
    paths = moduleRef.get(TpTournamentPathsService);
  });

  describe('matchScoresFrontendPath', () => {
    it("extracts the slug from a tournament's scores page", () => {
      expect(paths.matchScoresFrontendPath('s30/scores')).toBe('s30');
    });

    it.each([
      ['the bare tournament path', 's30'],
      ['another tournament page', 's30/news'],
      ['a path deeper under the scores page', 's30/scores/extra'],
      ['a scores page with no slug', '/scores'],
    ])('is undefined for %s', (_label, path) => {
      expect(paths.matchScoresFrontendPath(path)).toBeUndefined();
    });

    it("round-trips a request's scores page referer", () => {
      const page = paths
        .phaseRequest(baseUrls, 's30', 31255)
        .referer.slice(FRONTEND.length);

      expect(paths.matchScoresFrontendPath(page)).toBe('s30');
    });
  });

  describe('matchFrontendPath', () => {
    it("extracts the slug from a tournament's bare path", () => {
      expect(paths.matchFrontendPath('s30')).toBe('s30');
    });

    it("extracts the slug from one of a tournament's pages", () => {
      expect(paths.matchFrontendPath('s30/rules')).toBe('s30');
    });

    it('extracts the slug from a deeper path under the tournament', () => {
      expect(paths.matchFrontendPath('s30/a/b')).toBe('s30');
    });

    it("round-trips a request's tournament page referer", () => {
      const page = paths
        .newsRequest(baseUrls, 's30')
        .referer.slice(FRONTEND.length);

      expect(paths.matchFrontendPath(page)).toBe('s30');
    });

    it.each([
      ['an empty path', ''],
      ['an empty leading segment', '/scores'],
    ])('does not match %s', (_label, path) => {
      expect(paths.matchFrontendPath(path)).toBeUndefined();
    });
  });

  describe('requests', () => {
    it.each<
      [
        string,
        (p: TpTournamentPathsService, b: TpBaseUrls) => TpRequest,
        string,
        string,
      ]
    >([
      [
        'the tournament, sent from the page it is given',
        (p, b) => p.request(b, 's30', 'news'),
        'tournament/s30',
        's30/news',
      ],
      [
        'the tournament, sent from the scores page',
        (p, b) => p.request(b, 's30', 'scores'),
        'tournament/s30',
        's30/scores',
      ],
      [
        "a phase's fixtures",
        (p, b) => p.phaseRequest(b, 's30', 31255),
        'tournament/s30/phases?page=0&pageSize=50&phaseId=31255&type=COACH',
        's30/scores',
      ],
      [
        'one round of a phase',
        (p, b) =>
          p.phaseRoundRequest(b, 's30', { phaseId: 31255, roundNumber: 3 }),
        'tournament/s30/phases?page=0&pageSize=50&phaseId=31255&type=COACH&round=3',
        's30/scores',
      ],
      [
        "a category's inscriptions",
        (p, b) => p.inscriptionsRequest(b, 's30', 22308),
        'inscriptions/s30/category/22308/inscriptions?page=0&pageSize=75',
        's30/players',
      ],
      [
        'the awards',
        (p, b) => p.awardsRequest(b, 's30'),
        'awards/s30/awards',
        's30/awards',
      ],
      [
        'the news',
        (p, b) => p.newsRequest(b, 's30'),
        'tournament/s30/news',
        's30/news',
      ],
      [
        "a phase's classifications, in TP's own spelling",
        (p, b) => p.classificationsRequest(b, 's30', 34100),
        'tournament/s30/clasifications?page=0&pageSize=75&phaseId=34100&type=COACH',
        's30/classifications',
      ],
      [
        'the team stats',
        (p, b) => p.teamStatsRequest(b, 's30'),
        'tournament/s30/team-stats',
        's30/honours',
      ],
      [
        'the lineup stats',
        (p, b) => p.lineupStatsRequest(b, 's30'),
        'tournament/s30/lineup-stats',
        's30/honours',
      ],
      [
        'the coach stats',
        (p, b) => p.coachStatsRequest(b, 's30'),
        'tournament/s30/coach-stats',
        's30/honours',
      ],
      [
        'the statistics',
        (p, b) => p.statisticsRequest(b, 's30'),
        'tournament/s30/statistics',
        's30/statistics',
      ],
    ])('builds %s', (...[, build, path, page]) => {
      expect(build(paths, baseUrls)).toEqual({
        path,
        url: `${BACKEND}${path}`,
        referer: `${FRONTEND}${page}`,
      });
    });
  });
});

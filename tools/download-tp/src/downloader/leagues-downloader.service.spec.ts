import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import {
  TpMatchPathsService,
  TpRosterPathsService,
  TpTournamentPathsService,
} from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import type { StoredApiRequest } from './api-response-storing.service';
import { ApiResponseStoringService } from './api-response-storing.service';
import { FileSystemService } from './file-system.service';
import { LeaguesDownloaderService } from './leagues-downloader.service';
import { TpApiPathsService } from './tp-api-paths.service';

const FRONTEND = 'https://tp.example/blood-bowl/';

function phasePath(slug: string, phaseId: number): string {
  return `tournament/${slug}/phases?page=0&pageSize=50&phaseId=${phaseId}&type=COACH`;
}

function classificationsPath(slug: string, phaseId: number): string {
  return `tournament/${slug}/clasifications?page=0&pageSize=75&phaseId=${phaseId}&type=COACH`;
}

function inscriptionsPath(slug: string, categoryId: number): string {
  return `inscriptions/${slug}/category/${categoryId}/inscriptions?page=0&pageSize=75`;
}

/**
 * A minimal complete tournament: one category with one single-round phase
 * holding two matches, and two registered rosters.
 */
function tournamentResponses(slug: string): Record<string, unknown> {
  return {
    [`tournament/${slug}`]: { categories: [{ id: 7, phases: [{ id: 1 }] }] },
    [phasePath(slug, 1)]: {
      currentRound: 1,
      rounds: [{ roundNumber: 1 }],
      matches: [{ matchId: 11 }, { matchId: 12 }],
    },
    [inscriptionsPath(slug, 7)]: {
      '7': [{ roster: { id: 21 } }, { roster: { id: 22 } }],
    },
  };
}

describe('LeaguesDownloaderService', () => {
  let service: LeaguesDownloaderService;
  let configService: MockProxy<DownloadTpConfigService>;
  let tpFetcherService: MockProxy<TpFetcherService>;
  let storingService: MockProxy<ApiResponseStoringService>;
  let fileSystemService: MockProxy<FileSystemService>;
  let sessions: MockProxy<TpFetchSession>[];

  /** Cans each API path's response; a path not listed answers `{}`. */
  function stubResponses(responses: Record<string, unknown>): void {
    storingService.fetchAndStore.mockImplementation((_session, request) =>
      Promise.resolve(responses[request.path] ?? {}),
    );
  }

  function requests(): StoredApiRequest[] {
    return storingService.fetchAndStore.mock.calls.map((call) => call[1]);
  }

  function requestedPaths(): string[] {
    return requests().map((request) => request.path);
  }

  beforeEach(async () => {
    configService = mock<DownloadTpConfigService>();
    configService.getFrontendUrl.mockReturnValue(FRONTEND);
    configService.getTournaments.mockReturnValue(['season-30']);
    sessions = [];
    tpFetcherService = mock<TpFetcherService>();
    tpFetcherService.createSession.mockImplementation(() => {
      const session = mock<TpFetchSession>();
      sessions.push(session);
      return session;
    });
    storingService = mock<ApiResponseStoringService>();
    fileSystemService = mock<FileSystemService>();
    stubResponses(tournamentResponses('season-30'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaguesDownloaderService,
        // Pure, dependency-free path formatting, passed real so these tests
        // assert on the actual paths requested.
        TpApiPathsService,
        TpMatchPathsService,
        TpRosterPathsService,
        TpTournamentPathsService,
        { provide: DownloadTpConfigService, useValue: configService },
        { provide: TpFetcherService, useValue: tpFetcherService },
        { provide: ApiResponseStoringService, useValue: storingService },
        { provide: FileSystemService, useValue: fileSystemService },
      ],
    }).compile();
    service = moduleRef.get(LeaguesDownloaderService);
  });

  it('requests every endpoint in page order, each with the page it belongs to as referer', async () => {
    await service.downloadAllLeagues();

    const page = `${FRONTEND}season-30`;
    expect(requests().map((r) => [r.path, r.referer])).toEqual([
      ['tournament/season-30', `${page}/news`],
      ['tournament/season-30/news', `${page}/news`],
      [phasePath('season-30', 1), `${page}/scores`],
      ['match/11', `${page}/match/11`],
      ['match/12', `${page}/match/12`],
      [classificationsPath('season-30', 1), `${page}/classifications`],
      ['tournament/season-30/team-stats', `${page}/honours`],
      ['tournament/season-30/lineup-stats', `${page}/honours`],
      ['tournament/season-30/coach-stats', `${page}/honours`],
      ['tournament/season-30/statistics', `${page}/statistics`],
      [inscriptionsPath('season-30', 7), `${page}/players`],
      ['rosters/21', `${FRONTEND}roster/21`],
      ['rosters/22', `${FRONTEND}roster/22`],
      ['awards/season-30/awards', `${page}/awards`],
    ]);
  });

  it('stores every response of a tournament into its dir, through one shared session', async () => {
    await service.downloadAllLeagues();

    expect(tpFetcherService.createSession).toHaveBeenCalledTimes(1);
    for (const [session, request] of storingService.fetchAndStore.mock.calls) {
      expect(session).toBe(sessions[0]);
      expect(request.dirName).toBe('season-30');
    }
  });

  it('creates one output dir and one session per configured tournament', async () => {
    configService.getTournaments.mockReturnValue(['season-29', 'season-30']);
    stubResponses({
      ...tournamentResponses('season-29'),
      ...tournamentResponses('season-30'),
    });

    await service.downloadAllLeagues();

    expect(fileSystemService.mkdir.mock.calls).toEqual([
      ['season-29'],
      ['season-30'],
    ]);
    expect(sessions).toHaveLength(2);
    for (const [session, request] of storingService.fetchAndStore.mock.calls) {
      expect(session).toBe(
        request.dirName === 'season-29' ? sessions[0] : sessions[1],
      );
    }
    expect(new Set(requests().map((r) => r.dirName))).toEqual(
      new Set(['season-29', 'season-30']),
    );
  });

  it('requests every phase of every category, with its classifications and matches', async () => {
    stubResponses({
      'tournament/season-30': {
        categories: [
          { id: 7, phases: [{ id: 1 }, { id: 2 }] },
          { id: 8, phases: [{ id: 3 }] },
        ],
      },
      [phasePath('season-30', 1)]: {
        currentRound: 1,
        rounds: [{ roundNumber: 1 }],
        matches: [{ matchId: 'a' }],
      },
      [phasePath('season-30', 2)]: {
        currentRound: 1,
        rounds: [{ roundNumber: 1 }],
      },
      [phasePath('season-30', 3)]: {
        currentRound: 1,
        rounds: [{ roundNumber: 1 }],
        matches: [{ matchId: 'c' }],
      },
      [inscriptionsPath('season-30', 7)]: { '7': [{ roster: { id: 'r7' } }] },
      [inscriptionsPath('season-30', 8)]: { '8': [{ roster: { id: 'r8' } }] },
    });

    await service.downloadAllLeagues();

    expect(requestedPaths()).toEqual(
      expect.arrayContaining([
        phasePath('season-30', 1),
        phasePath('season-30', 2),
        phasePath('season-30', 3),
        classificationsPath('season-30', 1),
        classificationsPath('season-30', 2),
        classificationsPath('season-30', 3),
        'match/a',
        'match/c',
        inscriptionsPath('season-30', 7),
        inscriptionsPath('season-30', 8),
        'rosters/r7',
        'rosters/r8',
      ]),
    );
  });

  it("requests every round of a phase other than its current one, and those rounds' matches", async () => {
    const base = phasePath('season-30', 1);
    stubResponses({
      'tournament/season-30': { categories: [{ id: 7, phases: [{ id: 1 }] }] },
      [base]: {
        currentRound: 9,
        rounds: [{ roundNumber: 8 }, { roundNumber: 9 }, { roundNumber: 10 }],
        matches: [{ matchId: 'r9' }],
      },
      [`${base}&round=8`]: { matches: [{ matchId: 'r8' }] },
      [`${base}&round=10`]: { matches: [{ matchId: 'r10' }] },
    });

    await service.downloadAllLeagues();

    expect(
      requestedPaths().filter(
        (path) => path.includes('/phases?') || path.startsWith('match/'),
      ),
    ).toEqual([
      base,
      `${base}&round=8`,
      `${base}&round=10`,
      'match/r9',
      'match/r8',
      'match/r10',
    ]);
  });

  it('requests no extra rounds for a phase response with no rounds array', async () => {
    stubResponses({
      'tournament/season-30': { categories: [{ id: 7, phases: [{ id: 1 }] }] },
      [phasePath('season-30', 1)]: { matches: [{ matchId: 'lone' }] },
    });

    await service.downloadAllLeagues();

    expect(requestedPaths().some((path) => path.includes('&round='))).toBe(
      false,
    );
    expect(requestedPaths()).toContain('match/lone');
  });

  it.each([
    ['no categories', {}],
    ['an empty categories list', { categories: [] }],
    ['a category without phases', { categories: [{ id: 7 }] }],
  ])(
    'throws when the tournament response has %s',
    async (_label, tournament) => {
      stubResponses({ 'tournament/season-30': tournament });

      await expect(service.downloadAllLeagues()).rejects.toThrow(
        'Tournament season-30 lists no phases',
      );
    },
  );
});

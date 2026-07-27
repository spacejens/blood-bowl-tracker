import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';
import { LeaguesDownloaderService } from './leagues-downloader.service';

const FRONTEND = 'https://tp.example/blood-bowl/';

const singleRoundPhase = {
  currentRound: 1,
  rounds: [{ roundNumber: 1 }],
  matches: [{ matchId: 'm1' }, { matchId: 'm2' }],
};

const inscriptionsResponse = {
  '22494': [{ roster: { id: 'r1' } }, { roster: { id: 'r2' } }],
};

describe('LeaguesDownloaderService', () => {
  let service: LeaguesDownloaderService;
  let configService: MockProxy<ConfigService>;
  let pageViewer: MockProxy<ApiResponseStoringPageViewerService>;
  let fileSystemService: MockProxy<FileSystemService>;

  function stubPages(
    scores: Map<string, unknown>,
    players: Map<string, unknown>,
  ): void {
    pageViewer.viewPage.mockImplementation((options) => {
      if (options.pageUrl.endsWith('/scores')) return Promise.resolve(scores);
      if (options.pageUrl.endsWith('/players')) return Promise.resolve(players);
      return Promise.resolve(new Map<string, unknown>());
    });
  }

  function visitedUrls(): string[] {
    return pageViewer.viewPage.mock.calls.map((call) => call[0].pageUrl);
  }

  beforeEach(async () => {
    configService = mock<ConfigService>();
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'TP_FRONTEND_URL') return FRONTEND;
      if (key === 'TOURNAMENTS') return 'season-30';
      return '';
    });
    pageViewer = mock<ApiResponseStoringPageViewerService>();
    fileSystemService = mock<FileSystemService>();
    stubPages(
      new Map<string, unknown>([
        [
          'tournaments/18442/phases?page=0&pageSize=50&phaseId=1&type=COACH',
          singleRoundPhase,
        ],
      ]),
      new Map<string, unknown>([
        [
          'tournaments/18442/category/22494/inscriptions?page=0&pageSize=75',
          inscriptionsResponse,
        ],
      ]),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaguesDownloaderService,
        { provide: ConfigService, useValue: configService },
        {
          provide: ApiResponseStoringPageViewerService,
          useValue: pageViewer,
        },
        { provide: FileSystemService, useValue: fileSystemService },
      ],
    }).compile();
    service = moduleRef.get(LeaguesDownloaderService);
  });

  it('creates one output directory per configured tournament', async () => {
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'TP_FRONTEND_URL') return FRONTEND;
      if (key === 'TOURNAMENTS') return 'season-29,season-30';
      return '';
    });

    await service.downloadAllLeagues();

    expect(fileSystemService.mkdir).toHaveBeenCalledWith('season-29');
    expect(fileSystemService.mkdir).toHaveBeenCalledWith('season-30');
  });

  it('visits every top-level tournament page in order, into the tournament dir', async () => {
    await service.downloadAllLeagues();

    const base = `${FRONTEND}season-30`;
    expect(visitedUrls()).toEqual([
      `${base}/news`,
      `${base}/scores`,
      `${base}/match/m1`,
      `${base}/match/m2`,
      `${base}/classifications`,
      `${base}/honours`,
      `${base}/statistics`,
      `${base}/players`,
      `${FRONTEND}roster/r1`,
      `${FRONTEND}roster/r2`,
      `${base}/awards`,
    ]);
    for (const call of pageViewer.viewPage.mock.calls) {
      expect(call[0].dirName).toBe('season-30');
    }
  });

  it('clicks through the Team, Player and Coach toggles on the honours page', async () => {
    await service.downloadAllLeagues();

    expect(pageViewer.viewPage).toHaveBeenCalledWith(
      expect.objectContaining({
        pageUrl: `${FRONTEND}season-30/honours`,
        dirName: 'season-30',
        clickableElements: [
          { selector: '.mat-button-toggle-button', textContent: 'Team' },
          { selector: '.mat-button-toggle-button', textContent: 'Player' },
          { selector: '.mat-button-toggle-button', textContent: 'Coach' },
        ],
      }),
    );
  });

  it('visits the matches of every phase response, not just one', async () => {
    stubPages(
      new Map<string, unknown>([
        [
          'tournaments/18442/phases?page=0&pageSize=50&phaseId=1&type=COACH',
          {
            currentRound: 1,
            rounds: [{ roundNumber: 1 }],
            matches: [{ matchId: 'a' }],
          },
        ],
        [
          'tournaments/18442/phases?page=0&pageSize=50&phaseId=2&type=COACH',
          {
            currentRound: 1,
            rounds: [{ roundNumber: 1 }],
            matches: [{ matchId: 'b' }],
          },
        ],
      ]),
      new Map<string, unknown>([['x/inscriptions?page=0', {}]]),
    );

    await service.downloadAllLeagues();

    expect(visitedUrls()).toContain(`${FRONTEND}season-30/match/a`);
    expect(visitedUrls()).toContain(`${FRONTEND}season-30/match/b`);
  });

  it('visits the rosters of every inscriptions response, not just one', async () => {
    stubPages(
      new Map<string, unknown>([
        [
          'x/phases?type=COACH',
          { currentRound: 1, rounds: [{ roundNumber: 1 }], matches: [] },
        ],
      ]),
      new Map<string, unknown>([
        [
          'tournaments/18442/category/1/inscriptions?page=0&pageSize=75',
          { '1': [{ roster: { id: 'r1' } }] },
        ],
        [
          'tournaments/18442/category/2/inscriptions?page=0&pageSize=75',
          { '2': [{ roster: { id: 'r2' } }] },
        ],
      ]),
    );

    await service.downloadAllLeagues();

    expect(visitedUrls()).toContain(`${FRONTEND}roster/r1`);
    expect(visitedUrls()).toContain(`${FRONTEND}roster/r2`);
  });

  it('ignores a response whose path merely contains, but does not end with, the suffix', async () => {
    stubPages(
      new Map<string, unknown>([
        [
          'tournaments/18442/phases/summary?x=1',
          { matches: [{ matchId: 'nope' }] },
        ],
        [
          'tournaments/18442/phases?phaseId=1&type=COACH',
          {
            currentRound: 1,
            rounds: [{ roundNumber: 1 }],
            matches: [{ matchId: 'yes' }],
          },
        ],
      ]),
      new Map<string, unknown>([['x/inscriptions?page=0', {}]]),
    );

    await service.downloadAllLeagues();

    expect(visitedUrls()).toContain(`${FRONTEND}season-30/match/yes`);
    expect(visitedUrls()).not.toContain(`${FRONTEND}season-30/match/nope`);
  });

  it('throws when the fixtures page has no phases response', async () => {
    stubPages(
      new Map<string, unknown>([['something-else', {}]]),
      new Map<string, unknown>(),
    );

    await expect(service.downloadAllLeagues()).rejects.toThrow(
      'Did not find any response with URL path ending in phases',
    );
  });

  it('throws when the players page has no inscriptions response', async () => {
    stubPages(
      new Map<string, unknown>([
        [
          'x/phases?type=COACH',
          { currentRound: 1, rounds: [{ roundNumber: 1 }], matches: [] },
        ],
      ]),
      new Map<string, unknown>([['something-else', {}]]),
    );

    await expect(service.downloadAllLeagues()).rejects.toThrow(
      'Did not find any response with URL path ending in inscriptions',
    );
  });
});

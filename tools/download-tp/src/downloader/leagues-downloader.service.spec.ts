import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';
import { LeaguesDownloaderService } from './leagues-downloader.service';

const FRONTEND = 'https://tp.example/blood-bowl/';

const matchesResponse = {
  phaseA: {
    rounds: [
      {
        groups: [{ matches: [{ matchId: 'm1' }, { matchId: 'm2' }] }],
      },
      { groups: [{ matches: [{ matchId: 'm3' }] }] },
    ],
  },
};

const inscriptionsResponse = {
  entries: [{ roster: { id: 'r1' } }, { roster: { id: 'r2' } }],
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
    pageViewer.viewPage.mockImplementation((pageUrl: string) => {
      if (pageUrl.endsWith('/scores')) return Promise.resolve(scores);
      if (pageUrl.endsWith('/players')) return Promise.resolve(players);
      return Promise.resolve(new Map<string, unknown>());
    });
  }

  function visitedUrls(): string[] {
    return pageViewer.viewPage.mock.calls.map((call) => call[0]);
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
        ['tournament_x_phases?type=COACH', matchesResponse],
      ]),
      new Map<string, unknown>([
        ['tournament_x_inscriptions', inscriptionsResponse],
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

    expect(fileSystemService.mkdir).toHaveBeenCalledWith(
      'tournaments/season-29',
    );
    expect(fileSystemService.mkdir).toHaveBeenCalledWith(
      'tournaments/season-30',
    );
  });

  it('visits every top-level tournament page in order, into the tournament dir', async () => {
    await service.downloadAllLeagues();

    const base = `${FRONTEND}season-30`;
    expect(visitedUrls()).toEqual([
      `${base}/news`,
      `${base}/scores`,
      `${base}/match/m1`,
      `${base}/match/m2`,
      `${base}/match/m3`,
      `${base}/classifications`,
      `${base}/honours`,
      `${base}/statistics`,
      `${base}/players`,
      `${FRONTEND}roster/r1`,
      `${FRONTEND}roster/r2`,
      `${base}/awards`,
    ]);
    for (const call of pageViewer.viewPage.mock.calls) {
      expect(call[1]).toBe('tournaments/season-30');
    }
  });

  it('clicks through the Team, Player and Coach toggles on the honours page', async () => {
    await service.downloadAllLeagues();

    expect(pageViewer.viewPage).toHaveBeenCalledWith(
      `${FRONTEND}season-30/honours`,
      'tournaments/season-30',
      [
        { selector: '.mat-button-toggle-button', textContent: 'Team' },
        { selector: '.mat-button-toggle-button', textContent: 'Player' },
        { selector: '.mat-button-toggle-button', textContent: 'Coach' },
      ],
    );
  });

  it('uses the last response whose URL ends with the expected suffix', async () => {
    stubPages(
      new Map<string, unknown>([
        ['first_phases?type=COACH', { ignored: { rounds: [] } }],
        [
          'second_phases?type=COACH',
          { only: { rounds: [{ groups: [{ matches: [{ matchId: 'z' }] }] }] } },
        ],
      ]),
      new Map<string, unknown>([['x_inscriptions', { entries: [] }]]),
    );

    await service.downloadAllLeagues();

    expect(visitedUrls()).toContain(`${FRONTEND}season-30/match/z`);
  });

  it('throws when the fixtures page has no phases response', async () => {
    stubPages(
      new Map<string, unknown>([['something-else', {}]]),
      new Map<string, unknown>(),
    );

    await expect(service.downloadAllLeagues()).rejects.toThrow(
      'Did not find expected response with URL suffix phases?type=COACH',
    );
  });

  it('throws when the players page has no inscriptions response', async () => {
    stubPages(
      new Map<string, unknown>([
        ['x_phases?type=COACH', { p: { rounds: [] } }],
      ]),
      new Map<string, unknown>([['something-else', {}]]),
    );

    await expect(service.downloadAllLeagues()).rejects.toThrow(
      'Did not find expected response with URL suffix inscriptions',
    );
  });
});

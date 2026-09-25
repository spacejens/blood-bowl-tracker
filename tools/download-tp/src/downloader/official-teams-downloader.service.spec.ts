import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpOfficialTeamsPathsService } from '@blood-bowl-tracker/tp-paths';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { ApiResponseStoringService } from './api-response-storing.service';
import { FileSystemService } from './file-system.service';
import { OfficialTeamsDownloaderService } from './official-teams-downloader.service';

const FRONTEND = 'https://tp.example/blood-bowl/';

describe('OfficialTeamsDownloaderService', () => {
  let service: OfficialTeamsDownloaderService;
  let configService: MockProxy<DownloadTpConfigService>;
  let tpFetcherService: MockProxy<TpFetcherService>;
  let storingService: MockProxy<ApiResponseStoringService>;
  let fileSystemService: MockProxy<FileSystemService>;
  let sessions: MockProxy<TpFetchSession>[];

  beforeEach(async () => {
    configService = mock<DownloadTpConfigService>();
    configService.getFrontendUrl.mockReturnValue(FRONTEND);
    configService.getRulesSets.mockReturnValue(['BB2020', 'BB2025']);
    sessions = [];
    tpFetcherService = mock<TpFetcherService>();
    tpFetcherService.createSession.mockImplementation(() => {
      const session = mock<TpFetchSession>();
      sessions.push(session);
      return session;
    });
    storingService = mock<ApiResponseStoringService>();
    storingService.fetchAndStore.mockResolvedValue({});
    fileSystemService = mock<FileSystemService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        OfficialTeamsDownloaderService,
        // Pure, dependency-free path formatting, passed real so these tests
        // assert on the actual paths requested.
        TpOfficialTeamsPathsService,
        { provide: DownloadTpConfigService, useValue: configService },
        { provide: TpFetcherService, useValue: tpFetcherService },
        { provide: ApiResponseStoringService, useValue: storingService },
        { provide: FileSystemService, useValue: fileSystemService },
      ],
    }).compile();
    service = moduleRef.get(OfficialTeamsDownloaderService);
  });

  it('creates one output directory per configured rules set', async () => {
    await service.downloadOfficialTeams();

    expect(fileSystemService.mkdir.mock.calls.map((call) => call[0])).toEqual([
      'teams/BB2020',
      'teams/BB2025',
    ]);
  });

  it("requests each rules set's own team list into its own folder, with the teams page as referer", async () => {
    await service.downloadOfficialTeams();

    expect(
      storingService.fetchAndStore.mock.calls.map((call) => call[1]),
    ).toEqual([
      {
        path: 'rosters/masters?ruleSet=20',
        referer: `${FRONTEND}teams`,
        dirName: 'teams/BB2020',
      },
      {
        path: 'rosters/masters?ruleSet=25',
        referer: `${FRONTEND}teams`,
        dirName: 'teams/BB2025',
      },
    ]);
  });

  it('uses one shared session for the whole official-teams run', async () => {
    await service.downloadOfficialTeams();

    const calls = storingService.fetchAndStore.mock.calls;
    expect(sessions).toHaveLength(1);
    expect(calls[0][0]).toBe(sessions[0]);
    expect(calls[1][0]).toBe(sessions[0]);
  });

  it('matches rules set names case-insensitively', async () => {
    configService.getRulesSets.mockReturnValue(['db2021']);

    await service.downloadOfficialTeams();

    expect(storingService.fetchAndStore.mock.calls[0][1]).toMatchObject({
      path: 'rosters/masters?ruleSet=21',
      dirName: 'teams/db2021',
    });
  });

  it('fails with a helpful message for a rules set TP has no id for', async () => {
    configService.getRulesSets.mockReturnValue(['BB2016']);

    await expect(service.downloadOfficialTeams()).rejects.toThrow(
      'No TP ruleSet id is known for rules set "BB2016". Known rules sets are BB2020, DB2021, BB2025 (matched case-insensitively).',
    );
    expect(storingService.fetchAndStore).not.toHaveBeenCalled();
  });

  it('does nothing when no rules set is configured', async () => {
    configService.getRulesSets.mockReturnValue([]);

    await service.downloadOfficialTeams();

    expect(tpFetcherService.createSession).not.toHaveBeenCalled();
    expect(storingService.fetchAndStore).not.toHaveBeenCalled();
    expect(fileSystemService.mkdir).not.toHaveBeenCalled();
  });
});

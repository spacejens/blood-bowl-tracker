import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';
import { OfficialTeamsDownloaderService } from './official-teams-downloader.service';

const FRONTEND = 'https://tp.example/blood-bowl/';
const BACKEND = 'https://tp.example/api/';

describe('OfficialTeamsDownloaderService', () => {
  let service: OfficialTeamsDownloaderService;
  let configService: MockProxy<DownloadTpConfigService>;
  let pageViewer: MockProxy<ApiResponseStoringPageViewerService>;
  let fileSystemService: MockProxy<FileSystemService>;

  beforeEach(async () => {
    configService = mock<DownloadTpConfigService>();
    pageViewer = mock<ApiResponseStoringPageViewerService>();
    fileSystemService = mock<FileSystemService>();
    configService.getFrontendUrl.mockReturnValue(FRONTEND);
    configService.getBackendApiUrl.mockReturnValue(BACKEND);
    configService.getRulesSets.mockReturnValue(['BB2020', 'BB2025']);
    pageViewer.viewPage.mockResolvedValue(new Map<string, unknown>());

    const moduleRef = await Test.createTestingModule({
      providers: [
        OfficialTeamsDownloaderService,
        { provide: DownloadTpConfigService, useValue: configService },
        { provide: ApiResponseStoringPageViewerService, useValue: pageViewer },
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

  it('visits the teams page once per rules set, storing into that rules set folder', async () => {
    await service.downloadOfficialTeams();

    const calls = pageViewer.viewPage.mock.calls.map((call) => call[0]);
    expect(calls).toHaveLength(2);
    expect(calls[0].pageUrl).toBe(`${FRONTEND}teams`);
    expect(calls[0].dirName).toBe('teams/BB2020');
    expect(calls[1].pageUrl).toBe(`${FRONTEND}teams`);
    expect(calls[1].dirName).toBe('teams/BB2025');
  });

  it('requests that rules set’s own masters endpoint from inside the page', async () => {
    await service.downloadOfficialTeams();

    const calls = pageViewer.viewPage.mock.calls.map((call) => call[0]);
    expect(calls[0].followUpRequests?.(new Map<string, unknown>())).toEqual([
      `${BACKEND}rosters/masters?ruleSet=20`,
    ]);
    expect(calls[1].followUpRequests?.(new Map<string, unknown>())).toEqual([
      `${BACKEND}rosters/masters?ruleSet=25`,
    ]);
  });

  it('stores only the response for the rules set being downloaded', async () => {
    await service.downloadOfficialTeams();

    const storeResponse = pageViewer.viewPage.mock.calls[0][0].storeResponse;
    expect(storeResponse?.('rosters/masters?ruleSet=20')).toBe(true);
    expect(storeResponse?.('rosters/masters?ruleSet=25')).toBe(false);
  });

  it('matches rules set names case-insensitively', async () => {
    configService.getRulesSets.mockReturnValue(['db2021']);

    await service.downloadOfficialTeams();

    const call = pageViewer.viewPage.mock.calls[0][0];
    expect(call.dirName).toBe('teams/db2021');
    expect(call.followUpRequests?.(new Map<string, unknown>())).toEqual([
      `${BACKEND}rosters/masters?ruleSet=21`,
    ]);
  });

  it('fails with a helpful message for a rules set TP has no id for', async () => {
    configService.getRulesSets.mockReturnValue(['BB2016']);

    await expect(service.downloadOfficialTeams()).rejects.toThrow('BB2016');
    expect(pageViewer.viewPage).not.toHaveBeenCalled();
  });

  it('does nothing when no rules set is configured', async () => {
    configService.getRulesSets.mockReturnValue([]);

    await service.downloadOfficialTeams();

    expect(pageViewer.viewPage).not.toHaveBeenCalled();
    expect(fileSystemService.mkdir).not.toHaveBeenCalled();
  });
});

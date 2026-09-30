import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { BrowserLeaguesDownloaderService } from './browser-leagues-downloader.service';
import { BrowserOfficialTeamsDownloaderService } from './browser-official-teams-downloader.service';
import { DownloadRunnerService } from './download-runner.service';
import { HttpLeaguesDownloaderService } from './http-leagues-downloader.service';
import { HttpOfficialTeamsDownloaderService } from './http-official-teams-downloader.service';

describe('DownloadRunnerService', () => {
  let service: DownloadRunnerService;
  let configService: MockProxy<DownloadTpConfigService>;
  let httpLeagues: MockProxy<HttpLeaguesDownloaderService>;
  let httpOfficialTeams: MockProxy<HttpOfficialTeamsDownloaderService>;
  let browserLeagues: MockProxy<BrowserLeaguesDownloaderService>;
  let browserOfficialTeams: MockProxy<BrowserOfficialTeamsDownloaderService>;

  beforeEach(async () => {
    configService = mock<DownloadTpConfigService>();
    configService.getTournaments.mockReturnValue(['season-30']);
    httpLeagues = mock<HttpLeaguesDownloaderService>();
    httpOfficialTeams = mock<HttpOfficialTeamsDownloaderService>();
    browserLeagues = mock<BrowserLeaguesDownloaderService>();
    browserOfficialTeams = mock<BrowserOfficialTeamsDownloaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DownloadRunnerService,
        { provide: DownloadTpConfigService, useValue: configService },
        { provide: HttpLeaguesDownloaderService, useValue: httpLeagues },
        {
          provide: HttpOfficialTeamsDownloaderService,
          useValue: httpOfficialTeams,
        },
        { provide: BrowserLeaguesDownloaderService, useValue: browserLeagues },
        {
          provide: BrowserOfficialTeamsDownloaderService,
          useValue: browserOfficialTeams,
        },
      ],
    }).compile();
    service = moduleRef.get(DownloadRunnerService);
  });

  it('runs the browser pair, official teams first, when browser.enabled is true', async () => {
    configService.isBrowserEnabled.mockReturnValue(true);

    await service.run();

    expect(browserOfficialTeams.downloadOfficialTeams).toHaveBeenCalledTimes(1);
    expect(browserLeagues.downloadAllLeagues).toHaveBeenCalledTimes(1);
    expect(
      browserOfficialTeams.downloadOfficialTeams.mock.invocationCallOrder[0],
    ).toBeLessThan(
      browserLeagues.downloadAllLeagues.mock.invocationCallOrder[0],
    );
    expect(httpOfficialTeams.downloadOfficialTeams).not.toHaveBeenCalled();
    expect(httpLeagues.downloadAllLeagues).not.toHaveBeenCalled();
  });

  it('runs the plain-HTTP pair, official teams first, when browser.enabled is false', async () => {
    configService.isBrowserEnabled.mockReturnValue(false);

    await service.run();

    expect(httpOfficialTeams.downloadOfficialTeams).toHaveBeenCalledTimes(1);
    expect(httpLeagues.downloadAllLeagues).toHaveBeenCalledTimes(1);
    expect(
      httpOfficialTeams.downloadOfficialTeams.mock.invocationCallOrder[0],
    ).toBeLessThan(httpLeagues.downloadAllLeagues.mock.invocationCallOrder[0]);
    expect(browserOfficialTeams.downloadOfficialTeams).not.toHaveBeenCalled();
    expect(browserLeagues.downloadAllLeagues).not.toHaveBeenCalled();
  });

  it('skips the tournament download when no tournament is configured', async () => {
    configService.isBrowserEnabled.mockReturnValue(false);
    configService.getTournaments.mockReturnValue([]);

    await service.run();

    expect(httpOfficialTeams.downloadOfficialTeams).toHaveBeenCalledTimes(1);
    expect(httpLeagues.downloadAllLeagues).not.toHaveBeenCalled();
  });

  it('fails before any download when browser.enabled is not set', async () => {
    configService.isBrowserEnabled.mockImplementation(() => {
      throw new Error('browser.enabled is not set in download-tp-config.json5');
    });

    await expect(service.run()).rejects.toThrow(
      'browser.enabled is not set in download-tp-config.json5',
    );
    expect(httpOfficialTeams.downloadOfficialTeams).not.toHaveBeenCalled();
    expect(browserOfficialTeams.downloadOfficialTeams).not.toHaveBeenCalled();
    expect(configService.getTournaments).not.toHaveBeenCalled();
  });
});

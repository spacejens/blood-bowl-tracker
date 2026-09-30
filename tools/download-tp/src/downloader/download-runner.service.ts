import { Injectable } from '@nestjs/common';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { BrowserLeaguesDownloaderService } from './browser-leagues-downloader.service';
import { BrowserOfficialTeamsDownloaderService } from './browser-official-teams-downloader.service';
import { HttpLeaguesDownloaderService } from './http-leagues-downloader.service';
import { HttpOfficialTeamsDownloaderService } from './http-official-teams-downloader.service';

/** One download method's pair of downloaders. */
type Downloaders = {
  officialTeams: { downloadOfficialTeams(): Promise<void> };
  leagues: { downloadAllLeagues(): Promise<void> };
};

/**
 * One whole download-tp run: picks the download method from
 * `browser.enabled` and runs that method's downloaders.
 */
@Injectable()
export class DownloadRunnerService {
  constructor(
    private readonly downloadTpConfigService: DownloadTpConfigService,
    private readonly httpLeaguesDownloaderService: HttpLeaguesDownloaderService,
    private readonly httpOfficialTeamsDownloaderService: HttpOfficialTeamsDownloaderService,
    private readonly browserLeaguesDownloaderService: BrowserLeaguesDownloaderService,
    private readonly browserOfficialTeamsDownloaderService: BrowserOfficialTeamsDownloaderService,
  ) {}

  /**
   * `browser.enabled` is read first, so a missing or mistyped value fails
   * before any request is sent or any browser launched. The official team
   * list is per rules set, not per competition, so it runs alongside the
   * per-tournament download rather than instead of it. An empty
   * `download.tournaments` skips the (lengthy) per-tournament download
   * entirely, which is how a developer downloads only the official data.
   */
  async run(): Promise<void> {
    const downloaders = this.downloaders(
      this.downloadTpConfigService.isBrowserEnabled(),
    );
    await downloaders.officialTeams.downloadOfficialTeams();
    if (this.downloadTpConfigService.getTournaments().length > 0) {
      await downloaders.leagues.downloadAllLeagues();
    }
  }

  private downloaders(browserEnabled: boolean): Downloaders {
    return browserEnabled
      ? {
          officialTeams: this.browserOfficialTeamsDownloaderService,
          leagues: this.browserLeaguesDownloaderService,
        }
      : {
          officialTeams: this.httpOfficialTeamsDownloaderService,
          leagues: this.httpLeaguesDownloaderService,
        };
  }
}

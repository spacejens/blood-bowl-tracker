import { TpOfficialTeamsPathsService } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';

/**
 * Downloads TP's official team list by driving a real browser to the teams
 * page once per configured rules set. Paths and the rules-set id map come
 * from packages/tp-paths, shared with the plain-HTTP method.
 */
@Injectable()
export class BrowserOfficialTeamsDownloaderService {
  constructor(
    private readonly downloadTpConfigService: DownloadTpConfigService,
    private readonly pageViewerService: ApiResponseStoringPageViewerService,
    private readonly officialTeamsPaths: TpOfficialTeamsPathsService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  /**
   * Download TP's canonical official team list once per configured rules set.
   * Independent of `downloadAllLeagues()`: the official list is published per
   * rules set, not per competition, so nothing here reads
   * `download.tournaments`.
   *
   * One page visit per rules set. Opening the teams page always loads the
   * default tab's rules set, so that rules set's own response is requested
   * from inside the already-open page (reusing its session and headers) and
   * only that response is stored — otherwise every folder would also hold the
   * default tab's team list. No browser is launched at all when there is
   * nothing to download.
   */
  async downloadOfficialTeams(): Promise<void> {
    const rulesSets = this.downloadTpConfigService.getRulesSets();
    if (rulesSets.length === 0) {
      return;
    }
    const pageUrl =
      this.downloadTpConfigService.getFrontendUrl() +
      this.officialTeamsPaths.frontendPath();
    const backendApiUrl = this.downloadTpConfigService.getBackendApiUrl();
    for (const rulesSet of rulesSets) {
      const requestPath = this.officialTeamsPaths.apiPath(
        this.ruleSetId(rulesSet),
      );
      const dirName = `teams/${rulesSet}`;
      this.fileSystemService.mkdir(dirName);
      await this.pageViewerService.viewPage({
        pageUrl,
        dirName,
        followUpRequests: () => [backendApiUrl + requestPath],
        storeResponse: (requestUrl) => requestUrl === requestPath,
      });
    }
  }

  /** TP's `ruleSet` id for a configured rules set name, matched case-insensitively. */
  private ruleSetId(rulesSet: string): number {
    const ruleSetId = this.officialTeamsPaths.ruleSetIdFor(rulesSet);
    if (ruleSetId === undefined) {
      throw new Error(
        `No TP ruleSet id is known for rules set "${rulesSet}". Known rules ` +
          `sets are ${this.officialTeamsPaths.knownRulesSets().join(', ')} ` +
          '(matched case-insensitively).',
      );
    }
    return ruleSetId;
  }
}

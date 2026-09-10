import { Injectable } from '@nestjs/common';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { ApiResponseStoringPageViewerService } from './api-response-storing-page-viewer.service';
import { FileSystemService } from './file-system.service';

/** API path of TP's official team list, relative to the backend API URL. */
export const OFFICIAL_TEAMS_API_PATH = 'rosters/masters';

/**
 * TP's numeric `ruleSet` query parameter value per rules set, keyed by the
 * lower-cased rules set name used in `download.rulesSets` and in the era
 * config. The teams page selects a rules set with a tab whose label is
 * marketing copy ("Blood Bowl Official BB2025 · BB7"), not the rules set name,
 * and the only request the page makes for a tab is
 * `rosters/masters?ruleSet=<id>`, so the id is what identifies a rules set
 * here. A rules set TP has no id for cannot be downloaded, and adding one is a
 * deliberate change to this map.
 *
 * TP publishes both the official BB2025 team list and the unofficial
 * "Secret Bowl" one under the same id, in one response; they are told apart by
 * each roster's `teamRosterType`, not by a separate request.
 */
export const TP_RULES_SET_IDS: Readonly<Record<string, number>> = {
  bb2020: 20,
  db2021: 21,
  bb2025: 25,
};

@Injectable()
export class OfficialTeamsDownloaderService {
  constructor(
    private readonly downloadTpConfigService: DownloadTpConfigService,
    private readonly pageViewerService: ApiResponseStoringPageViewerService,
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
   * default tab's team list.
   */
  async downloadOfficialTeams(): Promise<void> {
    const frontendUrl = this.downloadTpConfigService.getFrontendUrl();
    const backendApiUrl = this.downloadTpConfigService.getBackendApiUrl();
    for (const rulesSet of this.downloadTpConfigService.getRulesSets()) {
      const requestPath = `${OFFICIAL_TEAMS_API_PATH}?ruleSet=${this.ruleSetId(rulesSet)}`;
      const dirName = `teams/${rulesSet}`;
      this.fileSystemService.mkdir(dirName);
      await this.pageViewerService.viewPage({
        pageUrl: frontendUrl + 'teams',
        dirName,
        followUpRequests: () => [backendApiUrl + requestPath],
        storeResponse: (requestUrl) => requestUrl === requestPath,
      });
    }
  }

  /** TP's `ruleSet` id for a configured rules set name, matched case-insensitively. */
  private ruleSetId(rulesSet: string): number {
    const ruleSetId = TP_RULES_SET_IDS[rulesSet.toLowerCase()];
    if (ruleSetId === undefined) {
      throw new Error(
        `No TP ruleSet id is known for rules set "${rulesSet}". Known rules ` +
          `sets are ${Object.keys(TP_RULES_SET_IDS).join(', ')} (matched ` +
          'case-insensitively).',
      );
    }
    return ruleSetId;
  }
}

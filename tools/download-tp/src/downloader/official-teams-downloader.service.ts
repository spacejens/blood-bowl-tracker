import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpOfficialTeamsPathsService } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { ApiResponseStoringService } from './api-response-storing.service';
import { FileSystemService } from './file-system.service';

@Injectable()
export class OfficialTeamsDownloaderService {
  constructor(
    private readonly downloadTpConfigService: DownloadTpConfigService,
    private readonly tpFetcherService: TpFetcherService,
    private readonly apiResponseStoringService: ApiResponseStoringService,
    private readonly officialTeamsPaths: TpOfficialTeamsPathsService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  /**
   * Download TP's canonical official team list once per configured rules set.
   * Independent of `downloadAllLeagues()`: the official list is published per
   * rules set, not per competition, so nothing here reads
   * `download.tournaments`.
   *
   * The whole run is one visit to the teams page — switching between rules
   * sets the way a user would switch tabs — so every rules set's request goes
   * through the same shared session, not a fresh one each time. No session is
   * created at all when there is nothing to download.
   */
  async downloadOfficialTeams(): Promise<void> {
    const rulesSets = this.downloadTpConfigService.getRulesSets();
    if (rulesSets.length === 0) {
      return;
    }
    const referer =
      this.downloadTpConfigService.getFrontendUrl() +
      this.officialTeamsPaths.frontendPath();
    const session = this.tpFetcherService.createSession();
    for (const rulesSet of rulesSets) {
      const path = this.officialTeamsPaths.apiPath(this.ruleSetId(rulesSet));
      const dirName = `teams/${rulesSet}`;
      this.fileSystemService.mkdir(dirName);
      await this.apiResponseStoringService.fetchAndStore(session, {
        path,
        referer,
        dirName,
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

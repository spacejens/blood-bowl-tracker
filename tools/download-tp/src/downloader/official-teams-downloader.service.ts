import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { DownloadTpConfigService } from '../config/download-tp-config.service';
import { ApiResponseStoringService } from './api-response-storing.service';
import { FileSystemService } from './file-system.service';
import { TpApiPathsService } from './tp-api-paths.service';

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
const TP_RULES_SET_IDS: Readonly<Record<string, number>> = {
  bb2020: 20,
  db2021: 21,
  bb2025: 25,
};

@Injectable()
export class OfficialTeamsDownloaderService {
  constructor(
    private readonly downloadTpConfigService: DownloadTpConfigService,
    private readonly tpFetcherService: TpFetcherService,
    private readonly apiResponseStoringService: ApiResponseStoringService,
    private readonly tpApiPathsService: TpApiPathsService,
    private readonly fileSystemService: FileSystemService,
  ) {}

  /**
   * Download TP's canonical official team list once per configured rules set.
   * Independent of `downloadAllLeagues()`: the official list is published per
   * rules set, not per competition, so nothing here reads
   * `download.tournaments`.
   *
   * Each rules set is its own visit to the teams page, so each gets its own
   * session, requesting only that rules set's team list.
   */
  async downloadOfficialTeams(): Promise<void> {
    const referer = this.downloadTpConfigService.getFrontendUrl() + 'teams';
    for (const rulesSet of this.downloadTpConfigService.getRulesSets()) {
      const path = this.tpApiPathsService.officialTeams(
        this.ruleSetId(rulesSet),
      );
      const dirName = `teams/${rulesSet}`;
      this.fileSystemService.mkdir(dirName);
      await this.apiResponseStoringService.fetchAndStore(
        this.tpFetcherService.createSession(),
        { path, referer, dirName },
      );
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

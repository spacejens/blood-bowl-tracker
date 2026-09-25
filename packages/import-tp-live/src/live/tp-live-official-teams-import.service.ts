import type {
  ImportError,
  ImportResult,
  TpOfficialTeamsImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpOfficialTeamsPathsService } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { TpOfficialTeamsImportService } from '../official-teams/tp-official-teams-import.service';
import { TP_EXTERNAL_SYSTEM_NAME } from '../tp-external-system';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpOfficialTeamsFetchService } from './tp-official-teams-fetch.service';

/** Options for {@link TpLiveOfficialTeamsImportService.importOfficialTeams}. */
export interface ImportLiveOfficialTeamsOptions {
  /**
   * The scrape-tp session to fetch through, so every rules set's request is
   * paced as one visit to the teams page. A fresh session is started when
   * omitted.
   */
  session?: TpFetchSession;
}

/** What importing one rules set's official team list did. */
export interface TpLiveOfficialTeamsRulesSetResult {
  rulesSet: string;
  /**
   * The fetch: how many races it returned, and its failures -- plus any
   * unexpected failure while writing, which leaves `write` undefined.
   */
  fetch: ImportResult;
  /** The write, one result per stage; undefined when nothing was written. */
  write: TpOfficialTeamsImportResult | undefined;
}

/** What one live official-teams import did, per rules set. */
export interface TpLiveOfficialTeamsImportResult {
  rulesSets: TpLiveOfficialTeamsRulesSetResult[];
}

@Injectable()
export class TpLiveOfficialTeamsImportService {
  constructor(
    private readonly fetcher: TpFetcherService,
    private readonly officialTeamsPaths: TpOfficialTeamsPathsService,
    private readonly officialTeamsFetch: TpOfficialTeamsFetchService,
    private readonly officialTeamsImport: TpOfficialTeamsImportService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Import TP's official team list live, for every rules set TP has an id
   * for: TP's teams page is one page with a tab per rules set, so one import
   * covers them all. Each rules set is fetched through one shared session,
   * parsed, then written in-process through the same TpOfficialTeamsImportService
   * `tpOfficialTeams.import` uses, under TP's external system. Every failure
   * is reported in that rules set's result, never thrown, and never stops
   * the other rules sets.
   */
  async importOfficialTeams({
    session,
  }: ImportLiveOfficialTeamsOptions = {}): Promise<TpLiveOfficialTeamsImportResult> {
    let visit = session;
    const rulesSets: TpLiveOfficialTeamsRulesSetResult[] = [];
    for (const rulesSet of this.officialTeamsPaths.knownRulesSets()) {
      const outcome = await this.importRulesSet(rulesSet, visit);
      rulesSets.push(outcome.result);
      visit = outcome.session;
    }
    return { rulesSets };
  }

  private async importRulesSet(
    rulesSet: string,
    session: TpFetchSession | undefined,
  ): Promise<{
    result: TpLiveOfficialTeamsRulesSetResult;
    session: TpFetchSession | undefined;
  }> {
    const errors: ImportError[] = [];
    try {
      const visit = session ?? this.fetcher.createSession();
      const races = await this.officialTeamsFetch.fetchOfficialTeams({
        rulesSet,
        errors,
        session: visit,
      });
      if (races === undefined) {
        return { result: this.notWritten(rulesSet, errors), session: visit };
      }
      const write = await this.officialTeamsImport.importOfficialTeams({
        rulesSet,
        races,
        externalSystemName: TP_EXTERNAL_SYSTEM_NAME,
      });
      return {
        result: {
          rulesSet,
          fetch: this.importResults.result({
            imported: races.length,
            errors,
          }),
          write,
        },
        session: visit,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(
        this.importResults.error({
          item: { rulesSet },
          message: `Unexpected error importing TP's official team list for rules set ${rulesSet}: ${message}`,
        }),
      );
      return { result: this.notWritten(rulesSet, errors), session };
    }
  }

  private notWritten(
    rulesSet: string,
    errors: ImportError[],
  ): TpLiveOfficialTeamsRulesSetResult {
    return {
      rulesSet,
      fetch: this.importResults.result({ imported: 0, errors }),
      write: undefined,
    };
  }
}

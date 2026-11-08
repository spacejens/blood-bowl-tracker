import type {
  ImportError,
  TpOfficialRace,
} from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { OfficialTeamsParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpOfficialTeamsPathsService } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { TpRequestFetchService } from './tp-request-fetch.service';

/** Options for {@link TpOfficialTeamsFetchService.fetchOfficialTeams}. */
export interface FetchOfficialTeamsOptions {
  /** The rules set to fetch the list for, by name (matched case-insensitively). */
  rulesSet: string;
  /** Where a fetch or parse failure is recorded. */
  errors: ImportError[];
  /** The session to fetch through; a fresh one is started when omitted. */
  session?: TpFetchSession;
}

@Injectable()
export class TpOfficialTeamsFetchService {
  constructor(
    private readonly requestFetch: TpRequestFetchService,
    private readonly officialTeamsPaths: TpOfficialTeamsPathsService,
    private readonly parser: OfficialTeamsParserService,
    private readonly importResults: ImportResultService,
    private readonly runner: UpsertRecorderService,
  ) {}

  /**
   * Fetch one rules set's official team list, the way TP's own teams page
   * does for that rules set's tab, and parse it into its official and legacy
   * races. A rules set TP has no id for, a request that fails, or a response
   * that does not parse records one ImportError and yields undefined. A TP
   * block (`TpBlockedError`) is rethrown instead, so the whole import stops
   * rather than carrying on against a TP that refuses every request.
   */
  async fetchOfficialTeams({
    rulesSet,
    errors,
    session,
  }: FetchOfficialTeamsOptions): Promise<TpOfficialRace[] | undefined> {
    const what = `TP's official team list for rules set ${rulesSet}`;
    const ruleSetId = this.officialTeamsPaths.ruleSetIdFor(rulesSet);
    if (ruleSetId === undefined) {
      errors.push(
        this.importResults.error({
          item: { rulesSet },
          message: `Could not fetch ${what}: TP has no ruleSet id for it.`,
        }),
      );
      return undefined;
    }
    const request = this.officialTeamsPaths.request(
      this.requestFetch.baseUrls(),
      ruleSetId,
    );
    const item = { rulesSet, path: request.path };
    const fetched = await this.requestFetch.fetch({
      request,
      what,
      item,
      errors,
      session,
    });
    if (fetched === undefined) {
      return undefined;
    }
    try {
      return this.parser.parse(fetched.content);
    } catch (error) {
      errors.push(
        this.importResults.error({
          item,
          message: `Could not parse ${what}: ${this.runner.messageOf(error)}`,
        }),
      );
      return undefined;
    }
  }
}

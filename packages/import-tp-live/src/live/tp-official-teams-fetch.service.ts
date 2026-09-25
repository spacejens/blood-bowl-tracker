import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { TpOfficialRace } from '@blood-bowl-tracker/parse-tp';
import { OfficialTeamsParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpOfficialTeamsPathsService } from '@blood-bowl-tracker/tp-paths';
import { Inject, Injectable } from '@nestjs/common';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

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
    @Inject(TP_CONNECTION_PROVIDER)
    private readonly connection: TpConnectionProvider,
    private readonly fetcher: TpFetcherService,
    private readonly officialTeamsPaths: TpOfficialTeamsPathsService,
    private readonly parser: OfficialTeamsParserService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Fetch one rules set's official team list, the way TP's own teams page
   * does for that rules set's tab, and parse it into its official and legacy
   * races. A rules set TP has no id for, a request that fails, or a response
   * that does not parse records one ImportError and yields undefined --
   * never a thrown exception.
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
    const path = this.officialTeamsPaths.apiPath(ruleSetId);
    const item = { rulesSet, path };
    let content: unknown;
    try {
      content = await (session ?? this.fetcher.createSession()).fetch(
        this.connection.getBackendApiUrl() + path,
        {
          referer:
            this.connection.getFrontendUrl() +
            this.officialTeamsPaths.frontendPath(),
        },
      );
    } catch (error) {
      errors.push(
        this.importResults.error({
          item,
          message: `Could not fetch ${what}: ${this.runner.messageOf(error)}`,
        }),
      );
      return undefined;
    }
    try {
      return this.parser.parse(content);
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

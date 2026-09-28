import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpRosterPathsService } from '@blood-bowl-tracker/tp-paths';
import { Inject, Injectable } from '@nestjs/common';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';

/** Options for {@link TpRosterFetchService.fetchRoster}. */
export interface FetchRosterOptions {
  /** TP's roster id: the number in the team's roster page URL. */
  rosterId: number;
  /** Where a fetch or parse failure is recorded. */
  errors: ImportError[];
  /**
   * The session to fetch through, so a caller fetching several rosters paces
   * them as one visit. A fresh session is started when omitted.
   */
  session?: TpFetchSession;
}

/** One fetched roster: parsed, and exactly as TP's API returned it. */
export interface TpFetchedRoster {
  roster: TpRoster;
  /**
   * The raw response, which a consumer scans for data the parse drops (the
   * skill master names a roster embeds).
   */
  content: unknown;
}

@Injectable()
export class TpRosterFetchService {
  constructor(
    @Inject(TP_CONNECTION_PROVIDER)
    private readonly connection: TpConnectionProvider,
    private readonly fetcher: TpFetcherService,
    private readonly rosterPaths: TpRosterPathsService,
    private readonly rosterParser: RosterParserService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Fetch one roster from TP's live API, the way TP's own roster page does,
   * and parse it, returning the parsed roster together with the raw
   * response. A failed request (network error, TP refusing or rate-limiting
   * it) or a response that does not parse as a roster is recorded as one
   * ImportError naming the roster id, and yields undefined — never a thrown
   * exception.
   */
  async fetchRoster({
    rosterId,
    errors,
    session,
  }: FetchRosterOptions): Promise<TpFetchedRoster | undefined> {
    let content: unknown;
    try {
      content = await (session ?? this.fetcher.createSession()).fetch(
        this.connection.getBackendApiUrl() + this.rosterPaths.apiPath(rosterId),
        {
          referer:
            this.connection.getFrontendUrl() +
            this.rosterPaths.frontendPath(rosterId),
        },
      );
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { rosterId },
          message: `Could not fetch TP roster ${rosterId}: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      return undefined;
    }
    try {
      return { roster: this.rosterParser.parse(content), content };
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { rosterId },
          message: `Could not parse TP roster ${rosterId}: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      return undefined;
    }
  }
}

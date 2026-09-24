import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { MatchParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpMatchPathsService } from '@blood-bowl-tracker/tp-paths';
import { Inject, Injectable } from '@nestjs/common';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';

/** Options for {@link TpMatchFetchService.fetchMatch}. */
export interface FetchMatchOptions {
  /** TP's match id: the number in the match page URL. */
  matchId: number;
  /** The match's tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /** Where a fetch or parse failure is recorded. */
  errors: ImportError[];
  /** The session to fetch through; a fresh one is started when omitted. */
  session?: TpFetchSession;
}

@Injectable()
export class TpMatchFetchService {
  constructor(
    @Inject(TP_CONNECTION_PROVIDER)
    private readonly connection: TpConnectionProvider,
    private readonly fetcher: TpFetcherService,
    private readonly matchPaths: TpMatchPathsService,
    private readonly matchParser: MatchParserService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Fetch one match from TP's live API, the way TP's own match page does,
   * and parse it. A failed request (network error, TP refusing or
   * rate-limiting it) or a response that does not parse as a match is
   * recorded as one ImportError naming the match id, and yields undefined —
   * never a thrown exception.
   */
  async fetchMatch({
    matchId,
    tournamentSlug,
    errors,
    session,
  }: FetchMatchOptions): Promise<TpMatch | undefined> {
    let content: unknown;
    try {
      content = await (session ?? this.fetcher.createSession()).fetch(
        this.connection.getBackendApiUrl() + this.matchPaths.apiPath(matchId),
        {
          referer:
            this.connection.getFrontendUrl() +
            this.matchPaths.frontendPath(tournamentSlug, matchId),
        },
      );
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { matchId },
          message: `Could not fetch TP match ${matchId}: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      return undefined;
    }
    try {
      return this.matchParser.parse(content);
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { matchId },
          message: `Could not parse TP match ${matchId}: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      return undefined;
    }
  }
}

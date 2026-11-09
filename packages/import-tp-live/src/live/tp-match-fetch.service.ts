import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { ImportResultService } from '@blood-bowl-tracker/import-shared';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { MatchParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpMatchPathsService } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { TpRequestFetchService } from './tp-request-fetch.service';

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
    private readonly requestFetch: TpRequestFetchService,
    private readonly matchPaths: TpMatchPathsService,
    private readonly matchParser: MatchParserService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Fetch one match from TP's live API, the way TP's own match page does,
   * and parse it. A failed request (network error, TP refusing or
   * rate-limiting it) or a response that does not parse as a match is
   * recorded as one ImportError naming the match id, and yields undefined. A TP
   * block (`TpBlockedError`) is rethrown instead, so the whole import stops
   * rather than carrying on against a TP that refuses every request.
   */
  async fetchMatch({
    matchId,
    tournamentSlug,
    errors,
    session,
  }: FetchMatchOptions): Promise<TpMatch | undefined> {
    const what = `TP match ${matchId}`;
    const item = { matchId };
    const fetched = await this.requestFetch.fetch({
      request: this.matchPaths.request(
        this.requestFetch.baseUrls(),
        tournamentSlug,
        matchId,
      ),
      what,
      item,
      errors,
      session,
    });
    if (fetched === undefined) {
      return undefined;
    }
    try {
      return this.matchParser.parse(fetched.content);
    } catch (error) {
      errors.push(
        this.importResults.error({
          item,
          message: `Could not parse ${what}: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      return undefined;
    }
  }
}

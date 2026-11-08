import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { ImportResultService } from '@blood-bowl-tracker/import-shared';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpRosterPathsService } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { TpRequestFetchService } from './tp-request-fetch.service';

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
    private readonly requestFetch: TpRequestFetchService,
    private readonly rosterPaths: TpRosterPathsService,
    private readonly rosterParser: RosterParserService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Fetch one roster from TP's live API, the way TP's own roster page does,
   * and parse it, returning the parsed roster together with the raw
   * response. A failed request (network error, TP refusing or rate-limiting
   * it) or a response that does not parse as a roster is recorded as one
   * ImportError naming the roster id, and yields undefined. A TP block
   * (`TpBlockedError`) is rethrown instead, so the whole import stops rather
   * than carrying on against a TP that refuses every request.
   */
  async fetchRoster({
    rosterId,
    errors,
    session,
  }: FetchRosterOptions): Promise<TpFetchedRoster | undefined> {
    const what = `TP roster ${rosterId}`;
    const item = { rosterId };
    const fetched = await this.requestFetch.fetch({
      request: this.rosterPaths.request(this.requestFetch.baseUrls(), rosterId),
      what,
      item,
      errors,
      session,
    });
    if (fetched === undefined) {
      return undefined;
    }
    try {
      return {
        roster: this.rosterParser.parse(fetched.content),
        content: fetched.content,
      };
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

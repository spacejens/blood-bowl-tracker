import type {
  ImportError,
  TpCompetitionAward,
} from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { AwardsParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpTournamentPathsService } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { TpRequestFetchService } from './tp-request-fetch.service';

/** Options for {@link TpAwardsFetchService.fetchAwards}. */
export interface FetchAwardsOptions {
  /** The tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /** Where a fetch or parse failure is recorded. */
  errors: ImportError[];
  /** The session to fetch through; a fresh one is started when omitted. */
  session?: TpFetchSession;
}

@Injectable()
export class TpAwardsFetchService {
  constructor(
    private readonly requestFetch: TpRequestFetchService,
    private readonly tournamentPaths: TpTournamentPathsService,
    private readonly awardsParser: AwardsParserService,
    private readonly importResults: ImportResultService,
    private readonly runner: UpsertRecorderService,
  ) {}

  /**
   * Fetch the tournament's awards, the way TP's own awards page does, and
   * parse them. An unfinished competition's awards parse to an empty list,
   * which is not an error. A request that fails or does not parse records
   * one ImportError and yields undefined. A TP block (`TpBlockedError`) is
   * rethrown instead, so the whole import stops rather than carrying on
   * against a TP that refuses every request.
   */
  async fetchAwards({
    tournamentSlug,
    errors,
    session,
  }: FetchAwardsOptions): Promise<TpCompetitionAward[] | undefined> {
    const request = this.tournamentPaths.awardsRequest(
      this.requestFetch.baseUrls(),
      tournamentSlug,
    );
    const item = { tournamentSlug, path: request.path };
    const what = `TP awards of tournament ${tournamentSlug}`;
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
      return this.awardsParser.parse(fetched.content);
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

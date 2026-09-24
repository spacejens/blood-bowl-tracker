import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { AwardsParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpTournamentPathsService } from '@blood-bowl-tracker/tp-paths';
import { Inject, Injectable } from '@nestjs/common';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

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
    @Inject(TP_CONNECTION_PROVIDER)
    private readonly connection: TpConnectionProvider,
    private readonly fetcher: TpFetcherService,
    private readonly tournamentPaths: TpTournamentPathsService,
    private readonly awardsParser: AwardsParserService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Fetch the tournament's awards, the way TP's own awards page does, and
   * parse them. An unfinished competition's awards parse to an empty list,
   * which is not an error. A request that fails or does not parse records
   * one ImportError and yields undefined.
   */
  async fetchAwards({
    tournamentSlug,
    errors,
    session,
  }: FetchAwardsOptions): Promise<TpAward[] | undefined> {
    const path = this.tournamentPaths.awardsApiPath(tournamentSlug);
    const item = { tournamentSlug, path };
    const what = `awards of tournament ${tournamentSlug}`;
    let content: unknown;
    try {
      content = await (session ?? this.fetcher.createSession()).fetch(
        this.connection.getBackendApiUrl() + path,
        {
          referer:
            this.connection.getFrontendUrl() +
            this.tournamentPaths.frontendPath(tournamentSlug, 'awards'),
        },
      );
    } catch (error) {
      errors.push(
        this.importResults.error({
          item,
          message: `Could not fetch TP ${what}: ${this.runner.messageOf(error)}`,
        }),
      );
      return undefined;
    }
    try {
      return this.awardsParser.parse(content);
    } catch (error) {
      errors.push(
        this.importResults.error({
          item,
          message: `Could not parse TP ${what}: ${this.runner.messageOf(error)}`,
        }),
      );
      return undefined;
    }
  }
}

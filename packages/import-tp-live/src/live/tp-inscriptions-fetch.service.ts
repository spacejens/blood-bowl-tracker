import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { InscriptionsParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpTournamentPathsService } from '@blood-bowl-tracker/tp-paths';
import { Inject, Injectable } from '@nestjs/common';

import type { TpConnectionProvider } from '../tp-import-providers';
import { TP_CONNECTION_PROVIDER } from '../tp-import-providers';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

/** Options for {@link TpInscriptionsFetchService.fetchParticipantRosterIds}. */
export interface FetchParticipantsOptions {
  /** The tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /** The tournament's category ids: inscriptions are requested per category. */
  categoryIds: number[];
  /** Where a fetch or parse failure is recorded. */
  errors: ImportError[];
  /** The session to fetch through; a fresh one is started when omitted. */
  session?: TpFetchSession;
}

@Injectable()
export class TpInscriptionsFetchService {
  constructor(
    @Inject(TP_CONNECTION_PROVIDER)
    private readonly connection: TpConnectionProvider,
    private readonly fetcher: TpFetcherService,
    private readonly tournamentPaths: TpTournamentPathsService,
    private readonly inscriptionsParser: InscriptionsParserService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Fetch every category's registered participants, the way TP's own
   * players page does, and return the TP roster id of every registered team,
   * deduped in first-seen order. Any request that fails or does not parse
   * records one ImportError and yields undefined: a partial list would
   * silently leave registered teams unlinked.
   */
  async fetchParticipantRosterIds({
    tournamentSlug,
    categoryIds,
    errors,
    session,
  }: FetchParticipantsOptions): Promise<number[] | undefined> {
    const visit = session ?? this.fetcher.createSession();
    const referer =
      this.connection.getFrontendUrl() +
      this.tournamentPaths.frontendPath(tournamentSlug, 'players');
    const rosterIds = new Set<number>();
    for (const categoryId of categoryIds) {
      const path = this.tournamentPaths.inscriptionsApiPath(
        tournamentSlug,
        categoryId,
      );
      const item = { tournamentSlug, path };
      const what = `inscriptions of category ${categoryId} of tournament ${tournamentSlug}`;
      let content: unknown;
      try {
        content = await visit.fetch(this.connection.getBackendApiUrl() + path, {
          referer,
        });
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
        for (const rosterId of this.inscriptionsParser.parseRosterIds(
          content,
        )) {
          rosterIds.add(rosterId);
        }
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
    return [...rosterIds];
  }
}

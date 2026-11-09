import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { InscriptionsParserService } from '@blood-bowl-tracker/parse-tp';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { TpTournamentPathsService } from '@blood-bowl-tracker/tp-paths';
import { Injectable } from '@nestjs/common';

import { TpRequestFetchService } from './tp-request-fetch.service';

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
    private readonly requestFetch: TpRequestFetchService,
    private readonly fetcher: TpFetcherService,
    private readonly tournamentPaths: TpTournamentPathsService,
    private readonly inscriptionsParser: InscriptionsParserService,
    private readonly importResults: ImportResultService,
    private readonly runner: UpsertRecorderService,
  ) {}

  /**
   * Fetch every category's registered participants, the way TP's own
   * players page does, and return the TP roster id of every registered team,
   * deduped in first-seen order. Any request that fails or does not parse
   * records one ImportError and yields undefined: a partial list would
   * silently leave registered teams unlinked. A TP block (`TpBlockedError`) is
   * rethrown instead, so the whole import stops rather than carrying on
   * against a TP that refuses every request.
   */
  async fetchParticipantRosterIds({
    tournamentSlug,
    categoryIds,
    errors,
    session,
  }: FetchParticipantsOptions): Promise<number[] | undefined> {
    const visit = session ?? this.fetcher.createSession();
    const baseUrls = this.requestFetch.baseUrls();
    const rosterIds = new Set<number>();
    for (const categoryId of categoryIds) {
      const request = this.tournamentPaths.inscriptionsRequest(
        baseUrls,
        tournamentSlug,
        categoryId,
      );
      const item = { tournamentSlug, path: request.path };
      const what = `TP inscriptions of category ${categoryId} of tournament ${tournamentSlug}`;
      const fetched = await this.requestFetch.fetch({
        request,
        what,
        item,
        errors,
        session: visit,
      });
      if (fetched === undefined) {
        return undefined;
      }
      try {
        for (const rosterId of this.inscriptionsParser.parseRosterIds(
          fetched.content,
        )) {
          rosterIds.add(rosterId);
        }
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
    return [...rosterIds];
  }
}

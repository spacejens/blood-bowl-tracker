import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpBlockedError } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import type { TpBracket } from './tp-bracket-fetch.service';
import type { TpMatchDataImportResult } from './tp-match-data-import.service';
import { TpMatchDataImportService } from './tp-match-data-import.service';

/** Options for {@link TpCompetitionMatchesBackfillService.backfill}. */
export interface BackfillMatchesOptions {
  /** The competition's tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /** The era the competition is imported under, by name. */
  era: string;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  /** The scrape-tp session every request is paced through. */
  session: TpFetchSession;
  /** The competition's whole bracket, already fetched; never re-fetched here. */
  bracket: TpBracket;
}

/**
 * Imports every completed match of a competition already imported, from
 * TP's live API: each bracket match with a recorded result, one at a time
 * through the caller's session, so TP sees one paced visit rather than a
 * burst. Matches not played yet are skipped. Re-importing a match already
 * imported is harmless, since every write is an upsert.
 */
@Injectable()
export class TpCompetitionMatchesBackfillService {
  constructor(
    private readonly matchData: TpMatchDataImportService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * One result for the whole backfill: `imported` counts the matches whose
   * row was written, and `errors` holds every stage error of every match. A
   * match that fails, even by throwing, is reported and the rest are still
   * imported — except for a TP block (`TpBlockedError`), which is rethrown at
   * once so no further match is attempted.
   */
  async backfill({
    tournamentSlug,
    era,
    externalSystemName,
    session,
    bracket,
  }: BackfillMatchesOptions): Promise<ImportResult> {
    const completed = bracket.matches.filter(
      (match) => match.winner !== undefined,
    );
    let imported = 0;
    const errors: ImportError[] = [];
    for (const { id: matchId } of completed) {
      try {
        const result = await this.matchData.importMatchData({
          matchId,
          tournamentSlug,
          era,
          externalSystemName,
          session,
          bracket,
        });
        if (result.match.imported > 0) {
          imported += 1;
        }
        errors.push(...this.errorsOf(result));
      } catch (error) {
        if (error instanceof TpBlockedError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        errors.push(
          this.importResults.error({
            item: { matchId },
            message: `Unexpected error backfilling match ${matchId}: ${message}`,
          }),
        );
      }
    }
    return this.importResults.result({ imported, errors });
  }

  /** Every error one match's import reported, in stage order. */
  private errorsOf(result: TpMatchDataImportResult): ImportError[] {
    return [
      result.homeTeam.team,
      result.homeTeam.players,
      result.awayTeam.team,
      result.awayTeam.players,
      result.match,
      result.participation,
      result.events,
      result.outcome,
    ].flatMap((stage) => stage.errors);
  }
}

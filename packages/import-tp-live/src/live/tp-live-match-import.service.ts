import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpCompetitionUpsertService } from '../competition/tp-competition-upsert.service';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpBracketFetchService } from './tp-bracket-fetch.service';
import { TpCompetitionMatchesBackfillService } from './tp-competition-matches-backfill.service';
import type { TpParticipantsBackfillResult } from './tp-competition-participants-backfill.service';
import { TpCompetitionParticipantsBackfillService } from './tp-competition-participants-backfill.service';
import { TpLiveStarPlayerHiresService } from './tp-live-star-player-hires.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpMatchDataImportService } from './tp-match-data-import.service';

/** Options for {@link TpLiveMatchImportService.importMatch}. */
export interface ImportLiveMatchOptions {
  /** TP's match id: the number in the match page URL. */
  matchId: number;
  /** The match's tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /**
   * The era to import the home team under, by name; the away team and the
   * competition follow the era the home team was imported under. Resolved
   * from the home team's race's one ongoing era when omitted.
   */
  era?: string;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  /**
   * The scrape-tp session to fetch through, so every request of the import
   * is paced as one visit. A fresh session is started when omitted.
   */
  session?: TpFetchSession;
}

/** What one live match import did, one result per stage. */
export interface TpLiveMatchImportResult {
  /** The tournament's bracket fetch and competition upsert. */
  competition: ImportResult;
  homeTeam: TpLiveTeamImportResult;
  awayTeam: TpLiveTeamImportResult;
  /** The star players either team hired through the match's inducements. */
  starPlayerHires: ImportResult;
  /** The match fetch, completion check, and the match row itself. */
  match: ImportResult;
  participation: ImportResult;
  events: ImportResult;
  outcome: ImportResult;
  /**
   * Importing the competition's registered teams, linking them and
   * recording its awards. Present only when this import created the
   * competition.
   */
  participantsBackfill?: TpParticipantsBackfillResult;
  /**
   * Importing every completed match of the competition's bracket, this
   * match included again. Present only when this import created the
   * competition.
   */
  matchesBackfill?: ImportResult;
}

@Injectable()
export class TpLiveMatchImportService {
  constructor(
    private readonly fetcher: TpFetcherService,
    private readonly bracketFetch: TpBracketFetchService,
    private readonly starPlayerHires: TpLiveStarPlayerHiresService,
    private readonly competitionUpsert: TpCompetitionUpsertService,
    private readonly matchData: TpMatchDataImportService,
    private readonly participantsBackfill: TpCompetitionParticipantsBackfillService,
    private readonly matchesBackfill: TpCompetitionMatchesBackfillService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Import one completed match from TP's live API: fetch it, import both its
   * teams live (always, keeping their rosters current; the away team in the
   * era the home team was imported under), import the star players either
   * team hired through the match's inducements, fetch its tournament's whole
   * bracket and upsert the competition, then import the match through the
   * same server-side core `tpMatches.import` uses. When this import creates
   * the competition, it then backfills the competition's registered teams
   * (with their participation links and its trophy awards) and every
   * completed match of the bracket, the requested match included again
   * (harmless: every write is an upsert); otherwise only the requested match
   * is imported, its bracket siblings used for classification and the
   * competition's dates only. The backfills report their own failures and
   * never fail this import. Every failure is reported in the returned
   * results, never thrown; a stage whose prerequisite failed is not
   * attempted and reports nothing imported.
   */
  async importMatch({
    matchId,
    tournamentSlug,
    era,
    externalSystemName,
    session,
  }: ImportLiveMatchOptions): Promise<TpLiveMatchImportResult> {
    try {
      const visit = session ?? this.fetcher.createSession();
      const { matchFetch, homeTeam, awayTeam, ready } =
        await this.matchData.importTeams({
          matchId,
          tournamentSlug,
          era,
          externalSystemName,
          session: visit,
        });
      if (ready === undefined) {
        return {
          ...this.nothingImported(),
          match: matchFetch,
          homeTeam,
          awayTeam,
        };
      }

      const starPlayerHires = await this.starPlayerHires.importHires({
        match: ready.match,
        homeTeamEra: homeTeam.teamEra,
        awayTeamEra: awayTeam.teamEra,
        externalSystemName,
      });

      const competitionErrors: ImportError[] = [];
      const bracket = await this.bracketFetch.fetchBracket({
        tournamentSlug,
        errors: competitionErrors,
        session: visit,
      });
      const upserted =
        bracket === undefined
          ? undefined
          : await this.competitionUpsert.upsertCompetition({
              tournament: bracket.tournament,
              playedDates: bracket.playedDates,
              era: ready.era,
              externalSystemName,
              errors: competitionErrors,
            });
      const competition = this.importResults.result({
        imported: upserted === undefined ? 0 : 1,
        errors: competitionErrors,
      });
      if (bracket === undefined || upserted === undefined) {
        return {
          ...this.nothingImported(),
          homeTeam,
          awayTeam,
          starPlayerHires,
          competition,
        };
      }

      const core = await this.matchData.writeMatch({
        match: ready.match,
        bracket,
        externalSystemName,
      });
      const imported: TpLiveMatchImportResult = {
        competition,
        homeTeam,
        awayTeam,
        starPlayerHires,
        ...core,
      };
      if (!upserted.created) {
        return imported;
      }
      const participantsBackfill = await this.participantsBackfill.backfill({
        tournamentSlug,
        categoryIds: bracket.tournament.categoryIds,
        era: ready.era,
        externalSystemName,
        session: visit,
        competition: upserted,
      });
      const matchesBackfill = await this.matchesBackfill.backfill({
        tournamentSlug,
        era: ready.era,
        externalSystemName,
        session: visit,
        bracket,
      });
      return { ...imported, participantsBackfill, matchesBackfill };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...this.nothingImported(),
        match: this.failed([
          {
            item: { matchId },
            message: `Unexpected error importing match ${matchId}: ${message}`,
          },
        ]),
      };
    }
  }

  private failed(errors: ImportError[]): ImportResult {
    return this.importResults.result({ imported: 0, errors });
  }

  /** Every stage reporting nothing imported and no error. */
  private nothingImported(): TpLiveMatchImportResult {
    const nothing = () =>
      this.importResults.result({ imported: 0, errors: [] });
    const noTeam = (): TpLiveTeamImportResult => ({
      team: nothing(),
      players: nothing(),
      era: undefined,
      teamEra: undefined,
    });
    return {
      competition: nothing(),
      homeTeam: noTeam(),
      awayTeam: noTeam(),
      starPlayerHires: nothing(),
      match: nothing(),
      participation: nothing(),
      events: nothing(),
      outcome: nothing(),
    };
  }
}

import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpCompetitionUpsertService } from '../competition/tp-competition-upsert.service';
import { TpMatchImportService } from '../match/tp-match-import.service';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpBracketFetchService } from './tp-bracket-fetch.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';
import { TpMatchFetchService } from './tp-match-fetch.service';

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
  /** The match fetch, completion check, and the match row itself. */
  match: ImportResult;
  participation: ImportResult;
  events: ImportResult;
  outcome: ImportResult;
}

@Injectable()
export class TpLiveMatchImportService {
  constructor(
    private readonly fetcher: TpFetcherService,
    private readonly matchFetch: TpMatchFetchService,
    private readonly bracketFetch: TpBracketFetchService,
    private readonly teamImport: TpLiveTeamImportService,
    private readonly competitionUpsert: TpCompetitionUpsertService,
    private readonly matchImport: TpMatchImportService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Import one completed match from TP's live API: fetch it, import both its
   * teams live (always, keeping their rosters current; the away team in the
   * era the home team was imported under), fetch its tournament's whole
   * bracket and upsert the competition, then import the match through the
   * same server-side core `tpMatches.import` uses. Only the requested match
   * is imported; its bracket siblings are used for classification and the
   * competition's dates only. Every failure is reported in the returned
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
      const matchErrors: ImportError[] = [];
      const match = await this.matchFetch.fetchMatch({
        matchId,
        tournamentSlug,
        errors: matchErrors,
        session: visit,
      });
      if (match !== undefined && match.winner === undefined) {
        matchErrors.push(
          this.importResults.error({
            item: { matchId },
            message: `TP match ${matchId} is not completed yet (it has no recorded result); only completed matches are imported.`,
          }),
        );
      }
      if (match === undefined || match.winner === undefined) {
        return { ...this.nothingImported(), match: this.failed(matchErrors) };
      }

      const homeTeam = await this.teamImport.importTeam({
        rosterId: match.homeTeamTpId,
        era,
        externalSystemName,
        session: visit,
        matchEmbeddedPlayers: match.homeRosterPlayers,
      });
      if (homeTeam.era === undefined) {
        return { ...this.nothingImported(), homeTeam };
      }
      const awayTeam = await this.teamImport.importTeam({
        rosterId: match.awayTeamTpId,
        era: homeTeam.era,
        externalSystemName,
        session: visit,
        matchEmbeddedPlayers: match.awayRosterPlayers,
      });
      if (awayTeam.era === undefined) {
        return { ...this.nothingImported(), homeTeam, awayTeam };
      }

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
              era: homeTeam.era,
              externalSystemName,
              errors: competitionErrors,
            });
      const competition = this.importResults.result({
        imported: upserted === undefined ? 0 : 1,
        errors: competitionErrors,
      });
      if (bracket === undefined || upserted === undefined) {
        return { ...this.nothingImported(), homeTeam, awayTeam, competition };
      }

      const core = await this.matchImport.importMatch({
        match,
        bracket: bracket.matches,
        competitionTpId: bracket.tournament.id,
        externalSystemName,
      });
      return { competition, homeTeam, awayTeam, ...core };
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
    });
    return {
      competition: nothing(),
      homeTeam: noTeam(),
      awayTeam: noTeam(),
      match: nothing(),
      participation: nothing(),
      events: nothing(),
      outcome: nothing(),
    };
  }
}

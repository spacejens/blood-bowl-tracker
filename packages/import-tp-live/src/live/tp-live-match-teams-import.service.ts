import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';
import { TpMatchFetchService } from './tp-match-fetch.service';

/** Options for {@link TpLiveMatchTeamsImportService.importMatchTeams}. */
export interface ImportLiveMatchTeamsOptions {
  /** TP's match id: the number in the match page URL. */
  matchId: number;
  /** The match's tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /**
   * The era to import the home team under, by name; the away team follows
   * the era the home team was imported under. Resolved from the home team's
   * race's one ongoing era when omitted.
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

/** What one live match-teams import did. */
export interface TpLiveMatchTeamsImportResult {
  /**
   * The match fetch: only ever failures, never counted as imported (no
   * match row is written).
   */
  match: ImportResult;
  homeTeam: TpLiveTeamImportResult;
  awayTeam: TpLiveTeamImportResult;
}

@Injectable()
export class TpLiveMatchTeamsImportService {
  constructor(
    private readonly fetcher: TpFetcherService,
    private readonly matchFetch: TpMatchFetchService,
    private readonly teamImport: TpLiveTeamImportService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Import both teams of one TP match, in whatever state the match is:
   * fetch it, then import its home team and its away team live (the away
   * team in the era the home team was imported under), each with its side's
   * match roster snapshot. Unlike a full match import, a match that has not
   * finished is not refused — its teams exist before it is played. Writes
   * no match, competition or star player hire. Every failure is reported in
   * the returned results, never thrown; a step whose prerequisite failed is
   * not attempted and reports nothing imported.
   */
  async importMatchTeams({
    matchId,
    tournamentSlug,
    era,
    externalSystemName,
    session,
  }: ImportLiveMatchTeamsOptions): Promise<TpLiveMatchTeamsImportResult> {
    try {
      const visit = session ?? this.fetcher.createSession();
      const matchErrors: ImportError[] = [];
      const match = await this.matchFetch.fetchMatch({
        matchId,
        tournamentSlug,
        errors: matchErrors,
        session: visit,
      });
      const fetched = this.importResults.result({
        imported: 0,
        errors: matchErrors,
      });
      if (match === undefined) {
        return {
          match: fetched,
          homeTeam: this.noTeam(),
          awayTeam: this.noTeam(),
        };
      }
      const homeTeam = await this.teamImport.importTeam({
        rosterId: match.homeTeamTpId,
        era,
        externalSystemName,
        session: visit,
        matchEmbeddedPlayers: match.homeRosterPlayers,
      });
      if (homeTeam.era === undefined) {
        return { match: fetched, homeTeam, awayTeam: this.noTeam() };
      }
      const awayTeam = await this.teamImport.importTeam({
        rosterId: match.awayTeamTpId,
        era: homeTeam.era,
        externalSystemName,
        session: visit,
        matchEmbeddedPlayers: match.awayRosterPlayers,
      });
      return { match: fetched, homeTeam, awayTeam };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        match: this.importResults.result({
          imported: 0,
          errors: [
            this.importResults.error({
              item: { matchId },
              message: `Unexpected error importing the teams of match ${matchId}: ${message}`,
            }),
          ],
        }),
        homeTeam: this.noTeam(),
        awayTeam: this.noTeam(),
      };
    }
  }

  private noTeam(): TpLiveTeamImportResult {
    const nothing = () =>
      this.importResults.result({ imported: 0, errors: [] });
    return {
      team: nothing(),
      players: nothing(),
      era: undefined,
      teamEra: undefined,
    };
  }
}

import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpCompetitionImportService } from '../competition/tp-competition-import.service';
import { TP_EXTERNAL_SYSTEM_NAME } from '../tp-external-system';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpAwardsFetchService } from './tp-awards-fetch.service';
import { TpBracketFetchService } from './tp-bracket-fetch.service';
import { TpInscriptionsFetchService } from './tp-inscriptions-fetch.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';

/** Options for {@link TpLiveCompetitionImportService.importCompetition}. */
export interface ImportLiveCompetitionOptions {
  /** The tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /**
   * The era to import the competition and its teams under, by name. It is
   * required because a competition has no single team to resolve an era
   * from, the way a team import does.
   */
  era: string;
  /**
   * The scrape-tp session to fetch through, so every request of the import
   * is paced as one visit. A fresh session is started when omitted.
   */
  session?: TpFetchSession;
}

/** One registered team's live import within a competition import. */
export interface TpLiveCompetitionTeamResult extends TpLiveTeamImportResult {
  rosterId: number;
}

/** What one live competition import did, one result per stage. */
export interface TpLiveCompetitionImportResult {
  /** The bracket fetch and the competition upsert. */
  competition: ImportResult;
  /** One live team import per registered team, in inscription order. */
  teams: TpLiveCompetitionTeamResult[];
  /** The inscriptions fetch and linking the registered teams. */
  participation: ImportResult;
  /** The awards fetch and recording the trophy awards. */
  trophyAwards: ImportResult;
}

@Injectable()
export class TpLiveCompetitionImportService {
  constructor(
    private readonly fetcher: TpFetcherService,
    private readonly bracketFetch: TpBracketFetchService,
    private readonly inscriptionsFetch: TpInscriptionsFetchService,
    private readonly awardsFetch: TpAwardsFetchService,
    private readonly teamImport: TpLiveTeamImportService,
    private readonly competitionImport: TpCompetitionImportService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Import one competition from TP's live API. The steps are: fetch its
   * whole bracket (for the competition's name and dates), fetch every
   * category's inscriptions, and import each registered team live, always
   * (keeping rosters current). Then fetch its awards and import everything
   * through the same server-side core `tpCompetitions.import` uses. A failed
   * inscriptions or awards fetch still imports the competition, with no
   * teams or no awards, and reports the fetch failure in that stage. Every
   * failure is reported in the returned results, never thrown.
   */
  async importCompetition({
    tournamentSlug,
    era,
    session,
  }: ImportLiveCompetitionOptions): Promise<TpLiveCompetitionImportResult> {
    const teams: TpLiveCompetitionTeamResult[] = [];
    try {
      const visit = session ?? this.fetcher.createSession();
      const competitionErrors: ImportError[] = [];
      const bracket = await this.bracketFetch.fetchBracket({
        tournamentSlug,
        errors: competitionErrors,
        session: visit,
      });
      if (bracket === undefined) {
        return {
          ...this.nothingImported(),
          competition: this.failed(competitionErrors),
        };
      }

      const participationErrors: ImportError[] = [];
      const participantRosterIds =
        await this.inscriptionsFetch.fetchParticipantRosterIds({
          tournamentSlug,
          categoryIds: bracket.tournament.categoryIds,
          errors: participationErrors,
          session: visit,
        });
      for (const rosterId of participantRosterIds ?? []) {
        const team = await this.teamImport.importTeam({
          rosterId,
          era,
          session: visit,
        });
        teams.push({ rosterId, ...team });
      }

      const trophyErrors: ImportError[] = [];
      const awards =
        participantRosterIds === undefined
          ? undefined
          : await this.awardsFetch.fetchAwards({
              tournamentSlug,
              errors: trophyErrors,
              session: visit,
            });

      const core = await this.competitionImport.importCompetition({
        tournament: {
          id: bracket.tournament.id,
          name: bracket.tournament.name,
        },
        playedDates: bracket.playedDates,
        era,
        participantRosterIds: participantRosterIds ?? [],
        awards: awards ?? [],
        externalSystemName: TP_EXTERNAL_SYSTEM_NAME,
      });
      return {
        competition: this.withErrors({
          result: core.competition,
          errors: competitionErrors,
        }),
        teams,
        participation: this.withErrors({
          result: core.participation,
          errors: participationErrors,
        }),
        trophyAwards: this.withErrors({
          result: core.trophyAwards,
          errors: trophyErrors,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...this.nothingImported(),
        teams,
        competition: this.failed([
          {
            item: { tournamentSlug },
            message: `Unexpected error importing competition ${tournamentSlug}: ${message}`,
          },
        ]),
      };
    }
  }

  /** A core stage's result, with the live fetch's own errors ahead of it. */
  private withErrors({
    result,
    errors,
  }: {
    result: ImportResult;
    errors: ImportError[];
  }): ImportResult {
    return this.importResults.result({
      imported: result.imported,
      errors: [...errors, ...result.errors],
    });
  }

  private failed(errors: ImportError[]): ImportResult {
    return this.importResults.result({ imported: 0, errors });
  }

  /** Every stage reporting nothing imported and no error. */
  private nothingImported(): TpLiveCompetitionImportResult {
    const nothing = () =>
      this.importResults.result({ imported: 0, errors: [] });
    return {
      competition: nothing(),
      teams: [],
      participation: nothing(),
      trophyAwards: nothing(),
    };
  }
}

import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpFetcherService } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpCompetitionImportService } from '../competition/tp-competition-import.service';
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
   * The era to import the competition and its teams under, by name. When
   * omitted, each registered team resolves its own era, and the competition
   * is imported under the one era they agree on (see `importCompetition`).
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
  /**
   * The era the competition was imported under: the given one, or the one
   * its teams agreed on. Undefined when the import stopped before an era was
   * settled.
   */
  era: string | undefined;
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
   * awards fetch still imports the competition, with no awards. A failed
   * inscriptions fetch still imports the competition, with no teams, only
   * when `era` is given explicitly; without one, it leaves no teams to
   * resolve an era from, so the competition stage fails instead. Either
   * fetch failure is reported in its own stage. With no
   * era given, the competition is imported under the one era its registered
   * teams were imported under; teams that disagree, or none resolving one,
   * fail the competition stage, while the teams stay imported. Every failure
   * is reported in the returned results, never thrown.
   */
  async importCompetition({
    tournamentSlug,
    era,
    externalSystemName,
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
          externalSystemName,
          session: visit,
        });
        teams.push({ rosterId, ...team });
      }

      const competitionEra =
        era ??
        this.agreedEra({ tournamentSlug, teams, errors: competitionErrors });
      if (competitionEra === undefined) {
        return {
          ...this.nothingImported(),
          competition: this.failed(competitionErrors),
          teams,
          participation: this.importResults.result({
            imported: 0,
            errors: participationErrors,
          }),
        };
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
        era: competitionEra,
        participantRosterIds: participantRosterIds ?? [],
        awards: awards ?? [],
        externalSystemName,
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
        era: competitionEra,
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
      era: undefined,
    };
  }

  /**
   * The one era every registered team that resolved an era was imported
   * under. Undefined, with the reason pushed onto `errors`, when they
   * disagree or none resolved one — a competition only ever registers teams
   * of one era, so either means its era cannot be determined yet.
   */
  private agreedEra({
    tournamentSlug,
    teams,
    errors,
  }: {
    tournamentSlug: string;
    teams: TpLiveCompetitionTeamResult[];
    errors: ImportError[];
  }): string | undefined {
    const eras = [
      ...new Set(
        teams.flatMap((team) => (team.era === undefined ? [] : [team.era])),
      ),
    ];
    if (eras.length === 1) {
      return eras[0];
    }
    const reason =
      teams.length === 0
        ? 'no registered teams were found to resolve an era from'
        : eras.length === 0
          ? 'none of its registered teams was imported under an era'
          : `its registered teams were imported under different eras (${eras.join(', ')})`;
    errors.push(
      this.importResults.error({
        item: { tournamentSlug },
        message: `Could not resolve an era for competition ${tournamentSlug}: ${reason}. Pass an era explicitly.`,
      }),
    );
    return undefined;
  }
}

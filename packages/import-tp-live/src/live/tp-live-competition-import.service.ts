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
import { TpCompetitionMatchesBackfillService } from './tp-competition-matches-backfill.service';
import type { TpLiveCompetitionTeamResult } from './tp-competition-participants-backfill.service';
import { TpCompetitionParticipantsBackfillService } from './tp-competition-participants-backfill.service';
import { TpExtraTrophyAwardsService } from './tp-extra-trophy-awards.service';

export type { TpLiveCompetitionTeamResult } from './tp-competition-participants-backfill.service';

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
  /**
   * Backfill every completed match of the competition even when it was
   * already imported. A competition this import newly creates always has
   * its completed matches backfilled; this forces it for one that exists.
   */
  forceMatchBackfill?: boolean;
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
   * Awarding the trophies TP does not record itself (see
   * TpExtraTrophyAwardsService), run only once the competition is finished:
   * its awards fetch returned at least one award. Nothing imported otherwise,
   * and one error when the import's own match backfill reported errors.
   */
  extraTrophyAwards: ImportResult;
  /**
   * The era the competition was imported under: the given one, or the one
   * its teams agreed on. Undefined when the import stopped before an era was
   * settled.
   */
  era: string | undefined;
  /**
   * Importing every completed match of the competition's bracket. Present
   * only when that backfill ran: the competition was newly created, or
   * `forceMatchBackfill` was set, and the competition itself was imported.
   */
  matchesBackfill?: ImportResult;
}

@Injectable()
export class TpLiveCompetitionImportService {
  constructor(
    private readonly fetcher: TpFetcherService,
    private readonly bracketFetch: TpBracketFetchService,
    private readonly awardsFetch: TpAwardsFetchService,
    private readonly participantsBackfill: TpCompetitionParticipantsBackfillService,
    private readonly competitionImport: TpCompetitionImportService,
    private readonly matchesBackfill: TpCompetitionMatchesBackfillService,
    private readonly extraTrophyAwards: TpExtraTrophyAwardsService,
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
   * is reported in the returned results, never thrown. Once the competition
   * is imported, every completed match of its bracket is backfilled —
   * reusing the bracket already fetched — when the competition was newly
   * created or `forceMatchBackfill` is set; the backfill reports its own
   * failures in `matchesBackfill` and never fails the import. Last, once
   * the competition is imported and finished (TP returned at least one
   * award), the trophies TP does not record itself are awarded, after the
   * match backfill. They are skipped, with one error, when that backfill
   * reported errors, since a missing match would skew them for good; when no
   * backfill ran they rely on the matches imported earlier. That stage
   * reports its own failures in `extraTrophyAwards` and never fails the
   * import. A failed awards or inscriptions fetch leaves the competition's
   * finished state unknown, so its stored end date is left as stored.
   */
  async importCompetition({
    tournamentSlug,
    era,
    externalSystemName,
    session,
    forceMatchBackfill = false,
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

      const registered = await this.participantsBackfill.importRegisteredTeams({
        tournamentSlug,
        categoryIds: bracket.tournament.categoryIds,
        era,
        externalSystemName,
        session: visit,
      });
      teams.push(...registered.teams);
      const participationErrors = registered.errors;
      const participantRosterIds = registered.rosterIds;

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
        awards,
        externalSystemName,
      });
      const imported: TpLiveCompetitionImportResult = {
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
        extraTrophyAwards: this.importResults.result({
          imported: 0,
          errors: [],
        }),
        era: competitionEra,
      };
      const matchesBackfill =
        core.competition.imported > 0 &&
        (core.competitionCreated || forceMatchBackfill)
          ? await this.matchesBackfill.backfill({
              tournamentSlug,
              era: competitionEra,
              externalSystemName,
              session: visit,
              bracket,
            })
          : undefined;
      const finished = awards !== undefined && awards.length > 0;
      const extraTrophyAwards =
        finished && core.competitionId !== undefined
          ? await this.extras({
              competitionId: core.competitionId,
              tournamentSlug,
              matchesBackfill,
            })
          : imported.extraTrophyAwards;
      return {
        ...imported,
        extraTrophyAwards,
        ...(matchesBackfill === undefined ? {} : { matchesBackfill }),
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

  /**
   * The extra trophy awards, unless the match backfill run in this import
   * reported errors: some matches may then be missing, and an award computed
   * from incomplete matches is never corrected later (trophies already
   * awarded are skipped). The skip is recorded as one error. Without a
   * backfill in this import, the extras rely on the matches imported earlier.
   */
  private async extras({
    competitionId,
    tournamentSlug,
    matchesBackfill,
  }: {
    competitionId: number;
    tournamentSlug: string;
    matchesBackfill: ImportResult | undefined;
  }): Promise<ImportResult> {
    if (matchesBackfill !== undefined && matchesBackfill.errors.length > 0) {
      return this.failed([
        this.importResults.error({
          item: { tournamentSlug },
          message: `Skipped awarding the extra trophies of competition ${tournamentSlug}: the match backfill reported errors, so some matches may be missing. Import the competition again once its matches import cleanly.`,
        }),
      ]);
    }
    return this.extraTrophyAwards.computeExtras({
      competitionId,
      tournamentSlug,
    });
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
      extraTrophyAwards: nothing(),
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

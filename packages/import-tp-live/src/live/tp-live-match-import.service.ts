import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import {
  TpBlockedError,
  TpFetcherService,
} from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import type { UpsertedTpCompetition } from '../competition/tp-competition-upsert.service';
import { TpCompetitionUpsertService } from '../competition/tp-competition-upsert.service';
import { TpImportResultsService } from '../tp-import-results.service';
import type { TpBracket } from './tp-bracket-fetch.service';
import { TpBracketFetchService } from './tp-bracket-fetch.service';
import { TpCompetitionMatchesBackfillService } from './tp-competition-matches-backfill.service';
import type { TpParticipantsBackfillResult } from './tp-competition-participants-backfill.service';
import { TpCompetitionParticipantsBackfillService } from './tp-competition-participants-backfill.service';
import { TpExtraTrophyAwardsService } from './tp-extra-trophy-awards.service';
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
  /**
   * Backfill the competition's registered teams and every completed match
   * even when the competition was already imported. A competition this
   * import newly creates always has them backfilled; this forces it for one
   * that exists, such as one whose earlier backfill a TP block interrupted.
   */
  forceMatchBackfill?: boolean;
}

/** Options for {@link TpLiveMatchImportService.finishCompetition}. */
interface FinishCompetitionOptions {
  tournamentSlug: string;
  bracket: TpBracket;
  era: string;
  externalSystemName: string;
  competition: UpsertedTpCompetition;
  /** Whether the import's match backfill reported errors. */
  matchesBackfillFailed: boolean;
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
   * recording its awards. Present only when the backfill ran: this import
   * created the competition, or `forceMatchBackfill` was set.
   */
  participantsBackfill?: TpParticipantsBackfillResult;
  /**
   * Importing every completed match of the competition's bracket, this
   * match included again. Present only when the backfill ran.
   */
  matchesBackfill?: ImportResult;
  /**
   * Finishing the competition this import created, once its backfill
   * fetched TP awards: re-upserting it as finished (settling its end date)
   * and awarding the trophies TP does not record itself, unless the match
   * backfill reported errors (one error is recorded instead). Present only
   * when the backfill ran; nothing imported when TP has no awards for it yet
   * or its awards could not be fetched.
   */
  extraTrophyAwards?: ImportResult;
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
    private readonly extraTrophyAwards: TpExtraTrophyAwardsService,
  ) {}

  /**
   * Import one completed match from TP's live API: fetch it, import both its
   * teams live (always, keeping their rosters current; the away team in the
   * era the home team was imported under), import the star players either
   * team hired through the match's inducements, fetch its tournament's whole
   * bracket and upsert the competition, then import the match through the
   * same server-side core `tpMatches.import` uses. When this import creates
   * the competition (or `forceMatchBackfill` is set), it then backfills the
   * competition's registered teams (with their participation links and its trophy awards) and every
   * completed match of the bracket, the requested match included again
   * (harmless: every write is an upsert); otherwise only the requested match
   * is imported, its bracket siblings used for classification and the
   * competition's dates only. The backfills report their own failures and
   * never fail this import. Every failure is reported in the returned
   * results, never thrown; a stage whose prerequisite failed is not
   * attempted and reports nothing imported. A TP block (`TpBlockedError`) is the one exception: it is rethrown at once, so no further team, match or rules set is attempted against a TP that refuses every request. The competition is created
   * unfinished, with no end date. When the participants backfill fetched TP
   * awards, the competition is finished after both backfills: re-upserted as
   * finished, which settles its end date, and awarded the trophies TP does
   * not record, reported in `extraTrophyAwards` (skipped, with one error,
   * when the match backfill reported errors). A failed awards fetch leaves the
   * finished state unknown, so neither happens.
   */
  async importMatch({
    matchId,
    tournamentSlug,
    era,
    externalSystemName,
    session,
    forceMatchBackfill = false,
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
      if (!upserted.created && !forceMatchBackfill) {
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
      const finished =
        participantsBackfill.awardsFetched !== undefined &&
        participantsBackfill.awardsFetched > 0;
      const extraTrophyAwards = finished
        ? await this.finishCompetition({
            tournamentSlug,
            bracket,
            era: ready.era,
            externalSystemName,
            competition: upserted,
            matchesBackfillFailed: matchesBackfill.errors.length > 0,
          })
        : this.importResults.result({ imported: 0, errors: [] });
      return {
        ...imported,
        participantsBackfill,
        matchesBackfill,
        extraTrophyAwards,
      };
    } catch (error) {
      if (error instanceof TpBlockedError) {
        throw error;
      }
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

  /**
   * A competition this import created and whose backfill fetched TP's
   * awards is finished: re-upsert it as a finished overlay over the whole
   * bracket's played dates, so its end date is settled in this same run,
   * then award the trophies TP does not record. A failed re-upsert is
   * reported but does not stop the awards, which need only the
   * competition's id. The awards are skipped, with one recorded error, when
   * the match backfill reported errors: a missing match would skew them for
   * good. That never holds back the end date.
   */
  private async finishCompetition({
    tournamentSlug,
    bracket,
    era,
    externalSystemName,
    competition,
    matchesBackfillFailed,
  }: FinishCompetitionOptions): Promise<ImportResult> {
    const errors: ImportError[] = [];
    // The return value is intentionally ignored: a failed re-upsert records
    // its error in `errors`, and the extras need only the competition's id.
    await this.competitionUpsert.upsertCompetition({
      tournament: bracket.tournament,
      playedDates: bracket.playedDates,
      era,
      externalSystemName,
      overlayExisting: true,
      finished: true,
      errors,
    });
    if (matchesBackfillFailed) {
      const skipped =
        this.extraTrophyAwards.skippedForBackfillErrors(tournamentSlug);
      return this.failed([...errors, ...skipped.errors]);
    }
    const extras = await this.extraTrophyAwards.computeExtras({
      competitionId: competition.competitionId,
      tournamentSlug,
    });
    return this.importResults.result({
      imported: extras.imported,
      errors: [...errors, ...extras.errors],
    });
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

import type {
  ImportError,
  ImportResult,
  TpCompetitionImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpCompetitionParticipantsService } from './tp-competition-participants.service';
import { TpCompetitionTrophyAwardsService } from './tp-competition-trophy-awards.service';
import type { TpCompetitionTournament } from './tp-competition-upsert.service';
import { TpCompetitionUpsertService } from './tp-competition-upsert.service';

/** Options for {@link TpCompetitionImportService.importCompetition}. */
export interface ImportCompetitionOptions {
  tournament: TpCompetitionTournament;
  /** Every dated match's date across the competition. */
  playedDates: Date[];
  /** The era to import a new competition under, by name. */
  era: string;
  /** TP roster ids of every team registered to the competition. */
  participantRosterIds: number[];
  /** The competition's parsed awards; empty for one with none yet. */
  awards: TpAward[];
  /** The name TP's external system is registered under. */
  externalSystemName: string;
}

/**
 * What {@link TpCompetitionImportService.importCompetition} did: the
 * `tpCompetitions.import` contract's stages, plus the competition's id and
 * whether its row was newly created. Both are read only by the live
 * competition import; the `tpCompetitions.import` route drops them.
 */
export interface TpCoreCompetitionImportResult extends TpCompetitionImportResult {
  /** True only when this call created the competition. */
  competitionCreated: boolean;
  /**
   * The stored competition's id, or undefined when the upsert failed. Read
   * only by the live competition import, to compute the extra trophy awards
   * of a finished competition.
   */
  competitionId: number | undefined;
}

/**
 * Imports one TP competition straight into the database: the shared core of
 * the live import (TpLiveCompetitionImportService) and the
 * `tpCompetitions.import` procedure tools/import-tp's bulk run calls once per
 * competition. Everything arrives already fetched and parsed. Every failure
 * is reported in the returned results rather than thrown, except an
 * unexpected database error, which propagates to the caller.
 */
@Injectable()
export class TpCompetitionImportService {
  constructor(
    private readonly upsert: TpCompetitionUpsertService,
    private readonly participants: TpCompetitionParticipantsService,
    private readonly trophyAwards: TpCompetitionTrophyAwardsService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Upserts the competition, links its registered teams, then records its
   * trophy awards for those linked teams. The upsert overlays an
   * already-imported competition's era, type and start date (and end date,
   * when finished) from this call's own data, matching BBL's and TP's bulk
   * import contract (see
   * tools/import-manual/data/before-other-importers/competitions.json5) — a
   * live match import's own incidental competition upsert does not, since it
   * only knows one match's date. A competition with at least one award is
   * finished, so the upsert writes its end date; one with none yet is not,
   * and has any stored end date reset to null (see
   * `UpsertTpCompetitionOptions.finished`). A stage whose prerequisite
   * failed is not attempted and reports nothing imported: nothing is linked
   * without a competition, and no award is recorded when the team link
   * failed. The result also says whether the competition was newly created;
   * nothing here acts on that.
   */
  async importCompetition({
    tournament,
    playedDates,
    era,
    participantRosterIds,
    awards,
    externalSystemName,
  }: ImportCompetitionOptions): Promise<TpCoreCompetitionImportResult> {
    const competitionErrors: ImportError[] = [];
    const competition = await this.upsert.upsertCompetition({
      tournament,
      playedDates,
      era,
      externalSystemName,
      overlayExisting: true,
      finished: awards.length > 0,
      errors: competitionErrors,
    });
    const competitionResult = this.importResults.result({
      imported: competition === undefined ? 0 : 1,
      errors: competitionErrors,
    });
    if (competition === undefined) {
      return {
        competition: competitionResult,
        participation: this.nothing(),
        trophyAwards: this.nothing(),
        competitionCreated: false,
        competitionId: undefined,
      };
    }
    const competitionCreated = competition.created;

    const participationErrors: ImportError[] = [];
    const teamEraIdsByRosterId = await this.participants.linkParticipants({
      competition,
      participantRosterIds,
      errors: participationErrors,
    });
    const participation = this.importResults.result({
      imported: teamEraIdsByRosterId?.size ?? 0,
      errors: participationErrors,
    });
    if (teamEraIdsByRosterId === undefined) {
      return {
        competition: competitionResult,
        participation,
        trophyAwards: this.nothing(),
        competitionCreated,
        competitionId: competition.competitionId,
      };
    }

    const trophyErrors: ImportError[] = [];
    const awarded = await this.trophyAwards.importAwards({
      competition,
      awards,
      teamEraIdsByRosterId,
      errors: trophyErrors,
    });
    return {
      competition: competitionResult,
      participation,
      trophyAwards: this.importResults.result({
        imported: awarded,
        errors: trophyErrors,
      }),
      competitionCreated,
      competitionId: competition.competitionId,
    };
  }

  private nothing(): ImportResult {
    return this.importResults.result({ imported: 0, errors: [] });
  }
}

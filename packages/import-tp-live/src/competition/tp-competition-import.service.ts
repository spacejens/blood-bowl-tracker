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
   * trophy awards for those linked teams. A stage whose prerequisite failed
   * is not attempted and reports nothing imported: nothing is linked without
   * a competition, and no award is recorded when the team link failed.
   */
  async importCompetition({
    tournament,
    playedDates,
    era,
    participantRosterIds,
    awards,
    externalSystemName,
  }: ImportCompetitionOptions): Promise<TpCompetitionImportResult> {
    const competitionErrors: ImportError[] = [];
    const competition = await this.upsert.upsertCompetition({
      tournament,
      playedDates,
      era,
      externalSystemName,
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
      };
    }

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
    };
  }

  private nothing(): ImportResult {
    return this.importResults.result({ imported: 0, errors: [] });
  }
}

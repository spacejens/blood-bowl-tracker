import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { TpFetchSession } from '@blood-bowl-tracker/scrape-tp';
import { TpBlockedError } from '@blood-bowl-tracker/scrape-tp';
import { Injectable } from '@nestjs/common';

import { TpCompetitionParticipantsService } from '../competition/tp-competition-participants.service';
import { TpCompetitionTrophyAwardsService } from '../competition/tp-competition-trophy-awards.service';
import type { UpsertedTpCompetition } from '../competition/tp-competition-upsert.service';
import { TpImportResultsService } from '../tp-import-results.service';
import { TpAwardsFetchService } from './tp-awards-fetch.service';
import { TpInscriptionsFetchService } from './tp-inscriptions-fetch.service';
import type { TpLiveTeamImportResult } from './tp-live-team-import.service';
import { TpLiveTeamImportService } from './tp-live-team-import.service';

/** One registered team's live import within a competition import. */
export interface TpLiveCompetitionTeamResult extends TpLiveTeamImportResult {
  rosterId: number;
}

/** Options for {@link TpCompetitionParticipantsBackfillService.importRegisteredTeams}. */
export interface ImportRegisteredTeamsOptions {
  /** The competition's tournament, as named in TP's frontend URLs. */
  tournamentSlug: string;
  /** The tournament's category ids: inscriptions are requested per category. */
  categoryIds: number[];
  /**
   * The era to import every team under, by name. When omitted, each team
   * resolves its own era.
   */
  era?: string;
  /** The name TP's external system is registered under. */
  externalSystemName: string;
  /** The scrape-tp session every request is paced through. */
  session: TpFetchSession;
}

/** What {@link TpCompetitionParticipantsBackfillService.importRegisteredTeams} did. */
export interface TpRegisteredTeamsImport {
  /** Every registered team's TP roster id; undefined when the inscriptions fetch failed. */
  rosterIds: number[] | undefined;
  /** One live team import per registered team, in inscription order. */
  teams: TpLiveCompetitionTeamResult[];
  /** The inscriptions fetch's failures. */
  errors: ImportError[];
}

/** Options for {@link TpCompetitionParticipantsBackfillService.backfill}. */
export interface BackfillParticipantsOptions extends ImportRegisteredTeamsOptions {
  /** The era the competition is imported under, by name; every team is imported under it. */
  era: string;
  /** The competition, already upserted. */
  competition: UpsertedTpCompetition;
}

/** What {@link TpCompetitionParticipantsBackfillService.backfill} did. */
export interface TpParticipantsBackfillResult {
  /** One live team import per registered team, in inscription order. */
  teams: TpLiveCompetitionTeamResult[];
  /** The inscriptions fetch and linking the registered teams. */
  participation: ImportResult;
  /** The awards fetch and recording the trophy awards. */
  trophyAwards: ImportResult;
  /**
   * How many awards TP returned: a non-empty list means the competition is
   * finished. Undefined when that is unknown because the awards fetch failed
   * or was never reached, which is not the same as none.
   */
  awardsFetched: number | undefined;
}

/**
 * A TP competition's registered teams, from TP's live API. The live
 * competition import uses {@link TpCompetitionParticipantsBackfillService.importRegisteredTeams}
 * ahead of its own shared-core import; a live match import that just
 * created a competition uses
 * {@link TpCompetitionParticipantsBackfillService.backfill} to also link
 * those teams and record the competition's trophy awards against the
 * competition it already upserted.
 */
@Injectable()
export class TpCompetitionParticipantsBackfillService {
  constructor(
    private readonly inscriptionsFetch: TpInscriptionsFetchService,
    private readonly awardsFetch: TpAwardsFetchService,
    private readonly teamImport: TpLiveTeamImportService,
    private readonly participants: TpCompetitionParticipantsService,
    private readonly trophyAwards: TpCompetitionTrophyAwardsService,
    private readonly importResults: TpImportResultsService,
  ) {}

  /**
   * Fetch every category's inscriptions, then import each registered team
   * live, one at a time, always (keeping rosters current). A team that
   * cannot be imported is reported in its own result and the rest carry
   * on. A failed inscriptions fetch imports no team.
   */
  async importRegisteredTeams({
    tournamentSlug,
    categoryIds,
    era,
    externalSystemName,
    session,
  }: ImportRegisteredTeamsOptions): Promise<TpRegisteredTeamsImport> {
    const errors: ImportError[] = [];
    const rosterIds = await this.inscriptionsFetch.fetchParticipantRosterIds({
      tournamentSlug,
      categoryIds,
      errors,
      session,
    });
    const teams: TpLiveCompetitionTeamResult[] = [];
    for (const rosterId of rosterIds ?? []) {
      const team = await this.teamImport.importTeam({
        rosterId,
        era,
        externalSystemName,
        session,
      });
      teams.push({ rosterId, ...team });
    }
    return { rosterIds, teams, errors };
  }

  /**
   * {@link importRegisteredTeams} under the competition's era, then link
   * every imported team to the already-upserted competition, then fetch
   * and record its trophy awards — the same stages the shared competition
   * core runs after its own upsert. A stage whose prerequisite failed is not
   * attempted and reports nothing imported. Every failure is reported in the
   * result, never thrown. A TP block (`TpBlockedError`) is the one exception: it is rethrown at once, so no further team, match or rules set is attempted against a TP that refuses every request.
   */
  async backfill({
    competition,
    ...teamOptions
  }: BackfillParticipantsOptions): Promise<TpParticipantsBackfillResult> {
    const { tournamentSlug, session } = teamOptions;
    let teams: TpLiveCompetitionTeamResult[] = [];
    try {
      const registered = await this.importRegisteredTeams(teamOptions);
      teams = registered.teams;
      const participationErrors = registered.errors;
      if (registered.rosterIds === undefined) {
        return {
          teams,
          participation: this.importResults.result({
            imported: 0,
            errors: participationErrors,
          }),
          trophyAwards: this.nothing(),
          awardsFetched: undefined,
        };
      }

      const teamEraIdsByRosterId = await this.participants.linkParticipants({
        competition,
        participantRosterIds: registered.rosterIds,
        errors: participationErrors,
      });
      const participation = this.importResults.result({
        imported: teamEraIdsByRosterId?.size ?? 0,
        errors: participationErrors,
      });
      if (teamEraIdsByRosterId === undefined) {
        return {
          teams,
          participation,
          trophyAwards: this.nothing(),
          awardsFetched: undefined,
        };
      }

      const trophyErrors: ImportError[] = [];
      const awards = await this.awardsFetch.fetchAwards({
        tournamentSlug,
        errors: trophyErrors,
        session,
      });
      const awarded =
        awards === undefined
          ? 0
          : await this.trophyAwards.importAwards({
              competition,
              awards,
              teamEraIdsByRosterId,
              errors: trophyErrors,
            });
      return {
        teams,
        participation,
        trophyAwards: this.importResults.result({
          imported: awarded,
          errors: trophyErrors,
        }),
        awardsFetched: awards?.length,
      };
    } catch (error) {
      if (error instanceof TpBlockedError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        teams,
        participation: this.importResults.result({
          imported: 0,
          errors: [
            this.importResults.error({
              item: { tournamentSlug },
              message: `Unexpected error backfilling the registered teams of competition ${tournamentSlug}: ${message}`,
            }),
          ],
        }),
        trophyAwards: this.nothing(),
        awardsFetched: undefined,
      };
    }
  }

  private nothing(): ImportResult {
    return this.importResults.result({ imported: 0, errors: [] });
  }
}

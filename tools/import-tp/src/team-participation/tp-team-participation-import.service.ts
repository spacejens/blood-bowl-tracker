import type {
  UpsertCompetition,
  UpsertMatch,
} from '@blood-bowl-tracker/api-contract';
import type {
  BatchBuffer,
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ImportResultService,
  MatchesImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { RosterEntry } from '../source/roster-collection.service';

/** One resolved team_eras row: its DB id and the era it belongs to. */
interface TeamEra {
  id: number;
  eraId: number;
}

/** One imported competition's upsert object plus its directory strings. */
interface CompetitionEntry {
  upsert: UpsertCompetition;
  era: string;
  competition: string;
}

export interface ImportTeamParticipationOptions {
  competitionsByTpId: Map<number, CompetitionEntry>;
  competitionIdsByTpId: Map<number, number>;
  matchesByCompetitionId: Map<number, TpMatch[]>;
  teamErasByRosterId: Map<number, TeamEra[]>;
  rosters: RosterEntry[];
}

interface ResolveTeamEraOptions {
  teamErasByRosterId: Map<number, TeamEra[]>;
  rosterId: number;
  eraId: number;
}

interface SyncCompetitionTeamsOptions {
  entry: CompetitionEntry;
  teamErasByRosterId: Map<number, TeamEra[]>;
  rosters: RosterEntry[];
  errors: ImportError[];
}

interface SyncMatchTeamsOptions {
  tpId: number;
  entry: CompetitionEntry;
  competitionIdsByTpId: Map<number, number>;
  matchesByCompetitionId: Map<number, TpMatch[]>;
  teamErasByRosterId: Map<number, TeamEra[]>;
  matchBatch: BatchBuffer<UpsertMatch>;
  errors: ImportError[];
}

@Injectable()
export class TpTeamParticipationImportService {
  constructor(
    private readonly competitionsImport: CompetitionsImportService,
    private readonly matchesImport: MatchesImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Populate match_teams and competition_teams for the already-imported TP
   * competitions and matches. Unlike BBL — which scrapes match-detail and
   * standings pages to infer membership — TP embeds both teams' roster ids in
   * each match file, and a roster file only appears under the competition
   * directories its team actually played in, so both joins resolve from data
   * earlier steps already produced (no new file scanning here).
   *
   * Per competition (iterating `competitionsByTpId`):
   *  1. competition_teams — the distinct roster ids whose era/competition
   *     directory strings match this competition's, each resolved to a
   *     team_eras id via `teamErasByRosterId` + this competition's `eraId`.
   *     If any resolve, the competition is re-upserted with those teamEraIds
   *     (additive; UpsertCompetitionSchema has no partial update, so the full
   *     original UpsertCompetition is reused). An unresolvable roster id is
   *     recorded as an error and skipped without aborting the competition.
   *  2. match_teams — each already-imported match's home/away roster ids are
   *     resolved the same way; if both resolve, the match is re-upserted (by
   *     its existing TP external id) with [home, away] teamEraIds. If either
   *     side does not resolve, an error is recorded and the match is skipped
   *     (its row, created upstream, is untouched).
   *
   * `imported` counts each competition successfully re-upserted with a
   * non-empty teamEraIds (match re-upserts do not increment it). The TP
   * external system id for a match's external id is read from the competition's
   * own `upsert.externalIds[0]` (as BBL's syncMatchTeams does) — no bootstrap.
   * Idempotent.
   */
  async importTeamParticipation(
    options: ImportTeamParticipationOptions,
  ): Promise<{ result: ImportResult }> {
    const {
      competitionsByTpId,
      competitionIdsByTpId,
      matchesByCompetitionId,
      teamErasByRosterId,
      rosters,
    } = options;
    let imported = 0;
    const errors: ImportError[] = [];
    const matchBatch = this.matchesImport.createBatch(errors);

    try {
      for (const [tpId, entry] of competitionsByTpId) {
        const upserted = await this.syncCompetitionTeams({
          entry,
          teamErasByRosterId,
          rosters,
          errors,
        });
        if (upserted) {
          imported += 1;
        }
        await this.syncMatchTeams({
          tpId,
          entry,
          competitionIdsByTpId,
          matchesByCompetitionId,
          teamErasByRosterId,
          matchBatch,
          errors,
        });
      }
    } finally {
      // Return value discarded on purpose: `imported` counts competitions
      // only, exactly as it did on the single-item path.
      await this.matchesImport.flushBatch(matchBatch);
    }

    return { result: this.importResults.result({ imported, errors }) };
  }

  /** Resolve a roster id + era id to its team_eras id, or undefined. */
  private resolveTeamEraId(options: ResolveTeamEraOptions): number | undefined {
    return options.teamErasByRosterId
      .get(options.rosterId)
      ?.find((teamEra) => teamEra.eraId === options.eraId)?.id;
  }

  /**
   * Narrow a competition upsert's eraId back to a definite number.
   * UpsertCompetitionSchema.eraId is optional to support partial-upsert
   * payloads from other callers, but TpCompetitionsImportService always
   * resolves eraId from the era name before building this upsert -- skipping
   * and recording an error otherwise -- so every CompetitionEntry reaching
   * this service has one.
   */
  private resolveDefiniteEraId(upsert: UpsertCompetition): number {
    if (upsert.eraId === undefined) {
      throw new Error(
        `Competition "${upsert.name}" has no eraId; import-tp always resolves eraId before building its upsert.`,
      );
    }
    return upsert.eraId;
  }

  /**
   * Re-upsert one competition with the team_eras of the rosters found under its
   * own directory. Returns true only if it was re-upserted successfully with a
   * non-empty teamEraIds (a competition with no matching/resolvable rosters is
   * skipped — its row, with an empty teamEraIds, already exists upstream).
   */
  private async syncCompetitionTeams(
    options: SyncCompetitionTeamsOptions,
  ): Promise<boolean> {
    const { entry, teamErasByRosterId, rosters, errors } = options;
    const { upsert, era, competition } = entry;

    const rosterIds = new Set<number>();
    for (const rosterEntry of rosters) {
      if (rosterEntry.era === era && rosterEntry.competition === competition) {
        rosterIds.add(rosterEntry.roster.id);
      }
    }

    const teamEraIds: number[] = [];
    for (const rosterId of rosterIds) {
      const teamEraId = this.resolveTeamEraId({
        teamErasByRosterId,
        rosterId,
        eraId: this.resolveDefiniteEraId(upsert),
      });
      if (teamEraId === undefined) {
        errors.push(
          this.importResults.error({
            item: { competition: upsert.name, roster: rosterId },
            message: `Skipping competition team for roster "${rosterId}" in competition "${upsert.name}": could not resolve its team era.`,
          }),
        );
        continue;
      }
      teamEraIds.push(teamEraId);
    }

    if (teamEraIds.length === 0) {
      return false;
    }
    return this.competitionsImport.upsertCompetition(
      { ...upsert, teamEraIds },
      errors,
    );
  }

  /**
   * Re-upsert each of a competition's already-imported matches with its
   * [home, away] team_eras so the API syncs match_teams (append-only). A
   * competition with no imported DB id, or a match whose two roster ids do not
   * both resolve, is recorded as an error and skipped without affecting the
   * rest.
   */
  private async syncMatchTeams(options: SyncMatchTeamsOptions): Promise<void> {
    const {
      tpId,
      entry,
      competitionIdsByTpId,
      matchesByCompetitionId,
      teamErasByRosterId,
      matchBatch,
      errors,
    } = options;
    const { upsert } = entry;
    const competitionId = competitionIdsByTpId.get(tpId);
    if (competitionId === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: upsert.name },
          message: `Skipping match teams for competition "${upsert.name}": it has no imported competition id.`,
        }),
      );
      return;
    }

    const matches = matchesByCompetitionId.get(competitionId) ?? [];
    const externalSystemId = upsert.externalIds[0].externalSystemId;
    for (const match of matches) {
      const homeTeamEraId = this.resolveTeamEraId({
        teamErasByRosterId,
        rosterId: match.homeTeamTpId,
        eraId: this.resolveDefiniteEraId(upsert),
      });
      const awayTeamEraId = this.resolveTeamEraId({
        teamErasByRosterId,
        rosterId: match.awayTeamTpId,
        eraId: this.resolveDefiniteEraId(upsert),
      });
      if (homeTeamEraId === undefined || awayTeamEraId === undefined) {
        errors.push(
          this.importResults.error({
            item: { competition: upsert.name, match: match.id },
            message: `Skipping match teams for match "${match.id}" in competition "${upsert.name}": could not resolve both team eras.`,
          }),
        );
        continue;
      }
      const data: UpsertMatch = {
        competitionId,
        playedAt: match.playedDate,
        name: match.name,
        externalIds: [{ externalSystemId, externalId: String(match.id) }],
        teamEraIds: [homeTeamEraId, awayTeamEraId],
      };
      await this.matchesImport.addToBatch(matchBatch, data);
    }
  }
}

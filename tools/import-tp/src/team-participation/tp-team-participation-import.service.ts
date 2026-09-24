import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  CompetitionsImportService,
  ImportResultService,
} from '@blood-bowl-tracker/import';
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

@Injectable()
export class TpTeamParticipationImportService {
  constructor(
    private readonly competitionsImport: CompetitionsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Populates `competition_teams`: each competition is re-upserted with the
   * team eras of the roster files under its own directory -- every
   * registered team, including one that never played a match. A match's own
   * teams are linked by `tpMatches.import` instead. A competition is
   * re-upserted with its full original `UpsertCompetition` because
   * `UpsertCompetitionSchema` has no partial update.
   */
  async importTeamParticipation(
    options: ImportTeamParticipationOptions,
  ): Promise<{ result: ImportResult }> {
    const { competitionsByTpId, teamErasByRosterId, rosters } = options;
    let imported = 0;
    const errors: ImportError[] = [];

    for (const entry of competitionsByTpId.values()) {
      const upserted = await this.syncCompetitionTeams({
        entry,
        teamErasByRosterId,
        rosters,
        errors,
      });
      if (upserted) {
        imported += 1;
      }
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
}

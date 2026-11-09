import type {
  ExternalId,
  ResolveResult,
  TeamEra,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Team } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  teamEras,
  teamExternalIds,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class TeamUpsertConflictError extends UpsertConflictError {}

export interface TeamWithEras extends Team {
  eras: TeamEra[];
}

@Injectable()
export class TeamsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertTeam,
  ): Promise<{ team: TeamWithEras; created: boolean }> {
    const { row: team, created } = await upsertByExternalIds<
      typeof teams,
      typeof teamExternalIds
    >({
      db: this.db,
      entityTable: teams,
      entityIdColumn: teams.id,
      values: {
        // A team's name is curated by tools/import-manual once the row
        // exists; only an upsert that says so may overwrite it.
        ...(data.renameExisting === true ? { name: data.name } : {}),
        raceId: data.raceId,
        coachId: data.coachId,
      },
      createOnlyValues: { name: data.name },
      externalIdTable: teamExternalIds,
      ownerIdColumn: teamExternalIds.teamId,
      externalSystemIdColumn: teamExternalIds.externalSystemId,
      externalIdColumn: teamExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: TeamUpsertConflictError,
      entityLabelPlural: 'teams',
      buildExternalIdRow: (teamId, externalId) => ({ teamId, ...externalId }),
    });

    const eras = await this.syncEras(team.id, data.eras);
    return { team: { ...team, eras }, created };
  }

  /**
   * Resolve one external-id pair to the team that already declares it. The
   * read-only half of what `upsert` does internally, exposed on its own so a
   * caller can reference a team imported in an earlier run, phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: teamExternalIds,
      ownerIdColumn: teamExternalIds.teamId,
      externalSystemIdColumn: teamExternalIds.externalSystemId,
      externalIdColumn: teamExternalIds.externalId,
      externalIds,
    });
  }

  /**
   * The team era linking `teamId` to `eraId`, or undefined when the team was
   * never imported under that era. How a match import resolves a
   * participating team, known by its source's team id, to the team era it
   * played the match as.
   */
  async findTeamEraId(
    teamId: number,
    eraId: number,
  ): Promise<number | undefined> {
    const rows = await this.db
      .select({ id: teamEras.id })
      .from(teamEras)
      .where(and(eq(teamEras.teamId, teamId), eq(teamEras.eraId, eraId)));
    return rows[0]?.id;
  }

  private async syncEras(teamId: number, eraIds: number[]): Promise<TeamEra[]> {
    const existing = await this.db
      .select({ id: teamEras.id, eraId: teamEras.eraId })
      .from(teamEras)
      .where(eq(teamEras.teamId, teamId));

    const existingEraIds = new Set(existing.map((r) => r.eraId));
    const toInsert = eraIds.filter((eraId) => !existingEraIds.has(eraId));

    if (toInsert.length === 0) {
      return existing;
    }

    const inserted = await this.db
      .insert(teamEras)
      .values(toInsert.map((eraId) => ({ teamId, eraId })))
      .returning({ id: teamEras.id, eraId: teamEras.eraId });

    return [...existing, ...inserted];
  }
}

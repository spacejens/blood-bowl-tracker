import type {
  ExternalId,
  ResolveResult,
  UpsertCompetition,
} from '@blood-bowl-tracker/api-contract';
import type { Competition, Db } from '@blood-bowl-tracker/db';
import {
  competitionExternalIds,
  competitions,
  competitionTeams,
  DB,
  eq,
} from '@blood-bowl-tracker/db';
import type { CompetitionType } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';
import { CompetitionEnrollmentService } from './competition-enrollment.service';

export class CompetitionUpsertConflictError extends UpsertConflictError {}

export interface CompetitionWithTeamEras extends Competition {
  teamEraIds: number[];
}

@Injectable()
export class CompetitionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly enrollment: CompetitionEnrollmentService,
  ) {}

  /**
   * Create or update a competition and add its newly listed team eras. The
   * enrollment rules are checked on the whole payload first, so a rejected
   * upsert (`CompetitionEnrollmentError`) writes nothing at all.
   */
  async upsert(
    data: UpsertCompetition,
  ): Promise<{ competition: CompetitionWithTeamEras; created: boolean }> {
    await this.enrollment.validate(data);
    const { row: competition, created } = await upsertByExternalIds<
      typeof competitions,
      typeof competitionExternalIds
    >({
      db: this.db,
      entityTable: competitions,
      entityIdColumn: competitions.id,
      values: {
        // A competition's name is curated by tools/import-manual once the
        // row exists; only an upsert that says so may overwrite it.
        ...(data.renameExisting === true ? { name: data.name } : {}),
        type: data.type,
        eraId: data.eraId,
        startDate: data.startDate,
        endDate: data.endDate,
        competitionGroupId: data.competitionGroupId,
      },
      createOnlyValues: { name: data.name },
      externalIdTable: competitionExternalIds,
      ownerIdColumn: competitionExternalIds.competitionId,
      externalSystemIdColumn: competitionExternalIds.externalSystemId,
      externalIdColumn: competitionExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: CompetitionUpsertConflictError,
      entityLabelPlural: 'competitions',
      buildExternalIdRow: (competitionId, externalId) => ({
        competitionId,
        ...externalId,
      }),
    });

    const teamEraIds = await this.syncTeamEras(competition.id, data.teamEraIds);
    return { competition: { ...competition, teamEraIds }, created };
  }

  /**
   * Resolve one external-id pair to the competition that already declares it.
   * The read-only half of what `upsert` does internally, exposed on its own
   * so a caller can reference a competition imported in an earlier run,
   * phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: competitionExternalIds,
      ownerIdColumn: competitionExternalIds.competitionId,
      externalSystemIdColumn: competitionExternalIds.externalSystemId,
      externalIdColumn: competitionExternalIds.externalId,
      externalIds,
    });
  }

  private async syncTeamEras(
    competitionId: number,
    teamEraIds: number[],
  ): Promise<number[]> {
    const existing = await this.db
      .select({ teamEraId: competitionTeams.teamEraId })
      .from(competitionTeams)
      .where(eq(competitionTeams.competitionId, competitionId));

    const existingIds = existing.map((r) => r.teamEraId);
    const existingSet = new Set(existingIds);
    const toInsert = teamEraIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await this.db
        .insert(competitionTeams)
        .values(toInsert.map((teamEraId) => ({ competitionId, teamEraId })));
    }

    return [...existingIds, ...toInsert];
  }

  async findById(id: number): Promise<
    | {
        id: number;
        name: string;
        type: CompetitionType;
        eraId: number;
        /** Its own span (`null` end = ongoing), for the insights scope suffix. */
        startDate: string;
        endDate: string | null;
      }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        eraId: competitions.eraId,
        startDate: competitions.startDate,
        endDate: competitions.endDate,
      })
      .from(competitions)
      .where(eq(competitions.id, id));
    return rows[0];
  }

  /**
   * The group a competition belongs to, or `undefined` when no such
   * competition exists. TP competition import reads it to find a stored
   * competition's group siblings when re-deriving its type.
   */
  async findGroupIdById(id: number): Promise<number | undefined> {
    const rows = await this.db
      .select({ competitionGroupId: competitions.competitionGroupId })
      .from(competitions)
      .where(eq(competitions.id, id));
    return rows[0]?.competitionGroupId;
  }

  /**
   * The name and type of every competition in one group, whichever source
   * imported it. Unordered: TP competition import derives a new instance's
   * sequence number (a maximum) and type (a consensus) from it, and neither
   * depends on order.
   */
  listNamesAndTypesByGroup(
    competitionGroupId: number,
  ): Promise<{ id: number; name: string; type: CompetitionType }[]> {
    return this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
      })
      .from(competitions)
      .where(eq(competitions.competitionGroupId, competitionGroupId));
  }
}

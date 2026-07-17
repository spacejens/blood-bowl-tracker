import type { Competition, Db } from '@blood-bowl-tracker/db';
import {
  competitionExternalIds,
  competitions,
  competitionTeams,
  DB,
  eras,
  leagues,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, ilike } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

export class CompetitionUpsertConflictError extends Error {}

export interface UpsertCompetitionData {
  name: string;
  type: 'season' | 'cup';
  eraId: number;
  teamEraIds: number[];
  externalIds: { externalSystemId: number; externalId: string }[];
}

export interface CompetitionWithTeamEras extends Competition {
  teamEraIds: number[];
}

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

@Injectable()
export class CompetitionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertCompetitionData,
  ): Promise<{ competition: CompetitionWithTeamEras; created: boolean }> {
    const { ownerIds: distinctCompetitionIds, existingRows } =
      await resolveExistingByExternalIds(
        this.db,
        competitionExternalIds,
        competitionExternalIds.competitionId,
        competitionExternalIds.externalSystemId,
        competitionExternalIds.externalId,
        data.externalIds,
      );

    if (distinctCompetitionIds.length > 1) {
      throw new CompetitionUpsertConflictError(
        `External IDs matched multiple existing competitions: ${distinctCompetitionIds.join(', ')}`,
      );
    }

    const values = {
      name: data.name,
      type: data.type,
      eraId: data.eraId,
    };

    let competition: Competition;
    const created = distinctCompetitionIds.length === 0;

    if (created) {
      const result = await this.db
        .insert(competitions)
        .values(values)
        .returning();
      competition = result[0];
    } else {
      const result = await this.db
        .update(competitions)
        .set(values)
        .where(eq(competitions.id, distinctCompetitionIds[0]))
        .returning();
      competition = result[0];
    }

    const teamEraIds = await this.syncTeamEras(competition.id, data.teamEraIds);
    await insertMissingExternalIds(
      this.db,
      competitionExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ competitionId: competition.id, ...pair }),
    );

    return { competition: { ...competition, teamEraIds }, created };
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

  countAll(): Promise<number> {
    return countRows(this.db, competitions);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(competitions)
      .where(eq(competitions.eraId, eraId));
    return row.count;
  }

  async countByType(type: 'season' | 'cup', eraId?: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(competitions)
      .where(
        eraId === undefined
          ? eq(competitions.type, type)
          : and(eq(competitions.type, type), eq(competitions.eraId, eraId)),
      );
    return row.count;
  }

  async findById(
    id: number,
  ): Promise<
    | { id: number; name: string; type: 'season' | 'cup'; eraId: number }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        eraId: competitions.eraId,
      })
      .from(competitions)
      .where(eq(competitions.id, id));
    return rows[0];
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string; leagueName: string }[]> {
    return this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        leagueName: leagues.name,
      })
      .from(competitions)
      .innerJoin(eras, eq(eras.id, competitions.eraId))
      .innerJoin(leagues, eq(leagues.id, eras.leagueId))
      .where(ilike(competitions.name, `${escapeLikePattern(prefix)}%`))
      .limit(limit);
  }
}

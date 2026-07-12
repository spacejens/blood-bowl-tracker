import type { Competition, Db } from '@blood-bowl-tracker/db';
import {
  competitionExternalIds,
  competitions,
  competitionTeams,
  DB,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, or } from 'drizzle-orm';
import { countRows } from '../shared/count-all';

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

@Injectable()
export class CompetitionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertCompetitionData,
  ): Promise<{ competition: CompetitionWithTeamEras; created: boolean }> {
    const existingRows = await this.db
      .select({
        competitionId: competitionExternalIds.competitionId,
        externalSystemId: competitionExternalIds.externalSystemId,
        externalId: competitionExternalIds.externalId,
      })
      .from(competitionExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(competitionExternalIds.externalSystemId, e.externalSystemId),
              eq(competitionExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctCompetitionIds = [
      ...new Set(existingRows.map((r) => r.competitionId)),
    ];

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
    await this.syncExternalIds(competition.id, data.externalIds, existingRows);

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

  private async syncExternalIds(
    competitionId: number,
    externalIds: { externalSystemId: number; externalId: string }[],
    existingRows: { externalSystemId: number; externalId: string }[],
  ): Promise<void> {
    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(competitionExternalIds).values(
        newExternalIds.map((e) => ({
          competitionId,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }
  }

  countAll(): Promise<number> {
    return countRows(this.db, competitions);
  }

  async countByType(type: 'season' | 'cup'): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(competitions)
      .where(eq(competitions.type, type));
    return row.count;
  }
}

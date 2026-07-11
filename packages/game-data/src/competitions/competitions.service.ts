import type { Competition, Db } from '@blood-bowl-tracker/db';
import {
  competitionExternalIds,
  competitions,
  DB,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

export class CompetitionUpsertConflictError extends Error {}

export interface UpsertCompetitionData {
  name: string;
  type: 'season' | 'cup';
  eraId: number;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class CompetitionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertCompetitionData,
  ): Promise<{ competition: Competition; created: boolean }> {
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

    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = data.externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(competitionExternalIds).values(
        newExternalIds.map((e) => ({
          competitionId: competition.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }

    return { competition, created };
  }
}

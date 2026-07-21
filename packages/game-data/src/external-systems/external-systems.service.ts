import type { ExternalSystem, NewExternalSystem } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import {
  competitionExternalIds,
  eraExternalIds,
  externalSystems,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, countDistinct, eq } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

@Injectable()
export class ExternalSystemsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: NewExternalSystem,
  ): Promise<{ system: ExternalSystem; created: boolean }> {
    const existing = await this.db
      .select()
      .from(externalSystems)
      .where(eq(externalSystems.name, data.name));

    if (existing[0]) {
      return { system: existing[0], created: false };
    }

    const result = await this.db
      .insert(externalSystems)
      .values(data)
      .returning();
    return { system: result[0], created: true };
  }

  countAll(): Promise<number> {
    return countRows(this.db, externalSystems);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(externalSystems.id) })
      .from(eraExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, eraExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(eraExternalIds.eraId, eraId),
          eq(externalSystems.isBookkeeping, false),
        ),
      );
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(externalSystems.id) })
      .from(competitionExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, competitionExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(competitionExternalIds.competitionId, competitionId),
          eq(externalSystems.isBookkeeping, false),
        ),
      );
    return row.count;
  }

  async listNamesByEra(eraId: number): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ name: externalSystems.name })
      .from(eraExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, eraExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(eraExternalIds.eraId, eraId),
          eq(externalSystems.isBookkeeping, false),
        ),
      )
      .orderBy(asc(externalSystems.name));
    return rows.map((row) => row.name);
  }
}

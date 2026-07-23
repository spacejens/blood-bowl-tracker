import type { ExternalSystem, NewExternalSystem } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import {
  competitionExternalIds,
  eraExternalIds,
  eras,
  externalSystems,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, countDistinct, eq } from 'drizzle-orm';

/**
 * Only systems in this category are counted or listed anywhere in stats and
 * deepdive views. Bookkeeping systems (e.g. the synthetic "Name" fallback)
 * are never real data; referenced-but-not-imported systems (e.g. a coach's
 * NAF number) describe the coach as a person, not the era/competition/league
 * being viewed — a coach who also played elsewhere would otherwise drag that
 * other scope's systems into this one's count.
 */
const COUNTED_CATEGORY = 'imported_data_source';

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

  async countAll(): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(externalSystems)
      .where(eq(externalSystems.category, COUNTED_CATEGORY));
    return row.count;
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
          eq(externalSystems.category, COUNTED_CATEGORY),
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
          eq(externalSystems.category, COUNTED_CATEGORY),
        ),
      );
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(externalSystems.id) })
      .from(eraExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, eraExternalIds.externalSystemId),
      )
      .innerJoin(eras, eq(eras.id, eraExternalIds.eraId))
      .where(
        and(
          eq(eras.leagueId, leagueId),
          eq(externalSystems.category, COUNTED_CATEGORY),
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
          eq(externalSystems.category, COUNTED_CATEGORY),
        ),
      )
      .orderBy(asc(externalSystems.name));
    return rows.map((row) => row.name);
  }
}

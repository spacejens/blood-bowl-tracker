import type { Db, Era } from '@blood-bowl-tracker/db';
import {
  DB,
  eraExternalIds,
  eraRulesSets,
  eras,
  leagues,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, ilike, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

export class EraUpsertConflictError extends Error {}

/**
 * Escapes Postgres LIKE/ILIKE metacharacters (`%`, `_`) and the default
 * escape character (`\`) in a user-supplied string so it is matched
 * literally rather than interpreted as a wildcard pattern. The backslash
 * must be escaped first so that escaping `%`/`_` afterwards doesn't
 * double-escape the backslashes it just introduced.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export interface UpsertEraData {
  name: string;
  leagueId: number;
  rulesSetIds: number[];
  startDate: string;
  endDate?: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

export interface EraWithRulesSets extends Era {
  rulesSetIds: number[];
}

@Injectable()
export class ErasService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertEraData,
  ): Promise<{ era: EraWithRulesSets; created: boolean }> {
    const existingRows = await this.db
      .select({
        eraId: eraExternalIds.eraId,
        externalSystemId: eraExternalIds.externalSystemId,
        externalId: eraExternalIds.externalId,
      })
      .from(eraExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(eraExternalIds.externalSystemId, e.externalSystemId),
              eq(eraExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctEraIds = [...new Set(existingRows.map((r) => r.eraId))];

    if (distinctEraIds.length > 1) {
      throw new EraUpsertConflictError(
        `External IDs matched multiple existing eras: ${distinctEraIds.join(', ')}`,
      );
    }

    const values = {
      name: data.name,
      leagueId: data.leagueId,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
    };

    let era: Era;
    const created = distinctEraIds.length === 0;

    if (created) {
      const result = await this.db.insert(eras).values(values).returning();
      era = result[0];
    } else {
      const result = await this.db
        .update(eras)
        .set(values)
        .where(eq(eras.id, distinctEraIds[0]))
        .returning();
      era = result[0];
    }

    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = data.externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(eraExternalIds).values(
        newExternalIds.map((e) => ({
          eraId: era.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }

    const rulesSetIds = await this.syncRulesSets(era.id, data.rulesSetIds);
    return { era: { ...era, rulesSetIds }, created };
  }

  private async syncRulesSets(
    eraId: number,
    rulesSetIds: number[],
  ): Promise<number[]> {
    const existing = await this.db
      .select({ rulesSetId: eraRulesSets.rulesSetId })
      .from(eraRulesSets)
      .where(eq(eraRulesSets.eraId, eraId));

    const existingIds = existing.map((r) => r.rulesSetId);
    const existingSet = new Set(existingIds);
    const toInsert = rulesSetIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await this.db
        .insert(eraRulesSets)
        .values(toInsert.map((rulesSetId) => ({ eraId, rulesSetId })));
    }

    return [...existingIds, ...toInsert];
  }

  async findById(
    id: number,
  ): Promise<{ id: number; name: string } | undefined> {
    const rows = await this.db
      .select({ id: eras.id, name: eras.name })
      .from(eras)
      .where(eq(eras.id, id));
    return rows[0];
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string; leagueName: string }[]> {
    return this.db
      .select({
        id: eras.id,
        name: eras.name,
        leagueName: leagues.name,
      })
      .from(eras)
      .innerJoin(leagues, eq(leagues.id, eras.leagueId))
      .where(ilike(eras.name, `${escapeLikePattern(prefix)}%`))
      .limit(limit);
  }

  countAll(): Promise<number> {
    return countRows(this.db, eras);
  }
}

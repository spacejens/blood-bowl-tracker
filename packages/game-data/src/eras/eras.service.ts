import type { UpsertEra } from '@blood-bowl-tracker/api-contract';
import type { Db, Era } from '@blood-bowl-tracker/db';
import {
  DB,
  eraExternalIds,
  eraRulesSets,
  eras,
  leagues,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { count, eq, ilike } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { escapeLikePattern } from '../shared/escape-like-pattern';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class EraUpsertConflictError extends UpsertConflictError {}

export interface EraWithRulesSets extends Era {
  rulesSetIds: number[];
}

@Injectable()
export class ErasService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertEra,
  ): Promise<{ era: EraWithRulesSets; created: boolean }> {
    const { row: era, created } = await upsertByExternalIds<
      typeof eras,
      typeof eraExternalIds
    >({
      db: this.db,
      entityTable: eras,
      entityIdColumn: eras.id,
      values: {
        name: data.name,
        leagueId: data.leagueId,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
      },
      externalIdTable: eraExternalIds,
      ownerIdColumn: eraExternalIds.eraId,
      externalSystemIdColumn: eraExternalIds.externalSystemId,
      externalIdColumn: eraExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: EraUpsertConflictError,
      entityLabelPlural: 'eras',
      buildExternalIdRow: (eraId, pair) => ({ eraId, ...pair }),
    });

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

  async getRulesSetNames(eraId: number): Promise<string[]> {
    const rows = await this.db
      .select({ name: rulesSets.name })
      .from(eraRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .where(eq(eraRulesSets.eraId, eraId))
      .orderBy(rulesSets.id);
    return rows.map((r) => r.name);
  }

  async getRulesSetNamesByLeague(leagueId: number): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ name: rulesSets.name })
      .from(eraRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .innerJoin(eras, eq(eras.id, eraRulesSets.eraId))
      .where(eq(eras.leagueId, leagueId))
      .orderBy(rulesSets.id);
    return rows.map((r) => r.name);
  }

  listErasWithLeague(): Promise<
    {
      id: number;
      name: string;
      leagueName: string;
      startDate: string;
      endDate: string | null;
    }[]
  > {
    return this.db
      .select({
        id: eras.id,
        name: eras.name,
        leagueName: leagues.name,
        startDate: eras.startDate,
        endDate: eras.endDate,
      })
      .from(eras)
      .innerJoin(leagues, eq(leagues.id, eras.leagueId));
  }

  async findByIdWithLeague(id: number): Promise<
    | {
        id: number;
        name: string;
        leagueName: string;
        startDate: string;
        endDate: string | null;
      }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: eras.id,
        name: eras.name,
        leagueName: leagues.name,
        startDate: eras.startDate,
        endDate: eras.endDate,
      })
      .from(eras)
      .innerJoin(leagues, eq(leagues.id, eras.leagueId))
      .where(eq(eras.id, id));
    return rows[0];
  }

  countAll(): Promise<number> {
    return countRows(this.db, eras);
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(eras)
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }
}

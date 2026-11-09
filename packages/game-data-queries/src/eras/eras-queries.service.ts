import type { Db } from '@blood-bowl-tracker/db';
import {
  count,
  DB,
  eq,
  eraRulesSets,
  eras,
  ilike,
  leagues,
  rulesSets,
} from '@blood-bowl-tracker/db';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';

/**
 * Read-only era lookups, listings and scoped counts for the Discord bot.
 * Era ingestion and the importers' era listing are `ErasService` in
 * packages/game-data.
 */
@Injectable()
export class ErasQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  /**
   * One era by id, with its own span — the insights scope suffix dates the
   * era it resolved, so the dates come along with the lookup rather than
   * needing a second query.
   */
  async findById(
    id: number,
  ): Promise<
    | { id: number; name: string; startDate: string; endDate: string | null }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: eras.id,
        name: eras.name,
        startDate: eras.startDate,
        endDate: eras.endDate,
      })
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
      .where(ilike(eras.name, `${this.likePattern.escape(prefix)}%`))
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
    // Postgres requires SELECT DISTINCT's ORDER BY expressions to appear in
    // the select list, so `id` is selected alongside `name` purely to make
    // `.orderBy(rulesSets.id)` valid -- it doesn't widen what gets deduped,
    // since id and name are in 1:1 correspondence per rules set.
    const rows = await this.db
      .selectDistinct({ id: rulesSets.id, name: rulesSets.name })
      .from(eraRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .innerJoin(eras, eq(eras.id, eraRulesSets.eraId))
      .where(eq(eras.leagueId, leagueId))
      .orderBy(rulesSets.id);
    return rows.map((r) => r.name);
  }

  listErasWithLeague(scope: FactScope): Promise<
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
      .innerJoin(leagues, eq(leagues.id, eras.leagueId))
      .where(
        scope.leagueId === undefined
          ? undefined
          : eq(eras.leagueId, scope.leagueId),
      );
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

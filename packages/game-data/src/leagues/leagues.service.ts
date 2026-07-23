import type { UpsertLeague } from '@blood-bowl-tracker/api-contract';
import type { League } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import { leagueExternalIds, leagues } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class LeagueUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class LeaguesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  async upsert(
    data: UpsertLeague,
  ): Promise<{ league: League; created: boolean }> {
    const { row: league, created } = await upsertByExternalIds<
      typeof leagues,
      typeof leagueExternalIds
    >({
      db: this.db,
      entityTable: leagues,
      entityIdColumn: leagues.id,
      values: { name: data.name },
      externalIdTable: leagueExternalIds,
      ownerIdColumn: leagueExternalIds.leagueId,
      externalSystemIdColumn: leagueExternalIds.externalSystemId,
      externalIdColumn: leagueExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: LeagueUpsertConflictError,
      entityLabelPlural: 'leagues',
      buildExternalIdRow: (leagueId, pair) => ({ leagueId, ...pair }),
    });

    return { league, created };
  }

  async findById(
    id: number,
  ): Promise<{ id: number; name: string } | undefined> {
    const rows = await this.db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(eq(leagues.id, id));
    return rows[0];
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: leagues.id, name: leagues.name })
      .from(leagues)
      .where(ilike(leagues.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }

  countAll(): Promise<number> {
    return countRows(this.db, leagues);
  }
}

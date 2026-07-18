import type { League } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import { leagueExternalIds, leagues } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class LeagueUpsertConflictError extends UpsertConflictError {}

export interface UpsertLeagueData {
  name: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class LeaguesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertLeagueData,
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

  countAll(): Promise<number> {
    return countRows(this.db, leagues);
  }
}

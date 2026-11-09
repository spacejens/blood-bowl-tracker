import type {
  ExternalId,
  ResolveResult,
  UpsertLeague,
} from '@blood-bowl-tracker/api-contract';
import type { Db, League } from '@blood-bowl-tracker/db';
import { DB, leagueExternalIds, leagues } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class LeagueUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class LeaguesService {
  constructor(@Inject(DB) private readonly db: Db) {}

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
      buildExternalIdRow: (leagueId, externalId) => ({
        leagueId,
        ...externalId,
      }),
    });

    return { league, created };
  }

  /**
   * Resolve one external-id pair to the league that already declares it. The
   * read-only half of what `upsert` does internally, exposed on its own so a
   * caller can reference a league imported in an earlier run, phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: leagueExternalIds,
      ownerIdColumn: leagueExternalIds.leagueId,
      externalSystemIdColumn: leagueExternalIds.externalSystemId,
      externalIdColumn: leagueExternalIds.externalId,
      externalIds,
    });
  }
}

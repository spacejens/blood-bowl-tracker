import type {
  ExternalId,
  ResolveResult,
  UpsertCompetitionGroup,
} from '@blood-bowl-tracker/api-contract';
import type { CompetitionGroup, Db } from '@blood-bowl-tracker/db';
import {
  competitionGroupExternalIds,
  competitionGroups,
  DB,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class CompetitionGroupUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class CompetitionGroupsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Every curated competition group, in the shape the API contract's
   * `CompetitionGroupSchema` declares. Projected in the query rather than
   * mapped afterward, so the history-tracking columns the contract
   * does not carry are never read. The only caller is `competitionGroups.list`
   * (via `RpcRouterFactoryService`); an importer that holds a competition's
   * `competitionGroupId` reaches it the same way to get the group's curated
   * *name* for a trophy's TP external id (`${disambiguator}-${groupName}`).
   */
  listAllForApi(): Promise<
    { id: number; name: string; leagueId: number; createdAt: Date }[]
  > {
    return this.db
      .select({
        id: competitionGroups.id,
        name: competitionGroups.name,
        leagueId: competitionGroups.leagueId,
        createdAt: competitionGroups.createdAt,
      })
      .from(competitionGroups);
  }

  /**
   * Every group with its name pattern, for TP competition import to match a
   * brand-new competition's raw name against. The column is NOT NULL, so
   * every group is a candidate.
   */
  listWithNamePatterns(): Promise<
    { id: number; name: string; namePattern: string }[]
  > {
    return this.db
      .select({
        id: competitionGroups.id,
        name: competitionGroups.name,
        namePattern: competitionGroups.namePattern,
      })
      .from(competitionGroups);
  }

  /**
   * Matched by external ids like every other entity's upsert. No source system
   * names a competition group, but tools/import-manual derives one under the
   * synthetic "Name" system from the group's curated name, which is what lets
   * its two separate import processes resolve the same group onto the same row
   * (see packages/db/src/schema/competition-groups.ts).
   */
  async upsert(
    data: UpsertCompetitionGroup,
  ): Promise<{ competitionGroup: CompetitionGroup; created: boolean }> {
    const { row: competitionGroup, created } = await upsertByExternalIds<
      typeof competitionGroups,
      typeof competitionGroupExternalIds
    >({
      db: this.db,
      entityTable: competitionGroups,
      entityIdColumn: competitionGroups.id,
      values: {
        name: data.name,
        leagueId: data.leagueId,
        namePattern: data.namePattern,
      },
      externalIdTable: competitionGroupExternalIds,
      ownerIdColumn: competitionGroupExternalIds.competitionGroupId,
      externalSystemIdColumn: competitionGroupExternalIds.externalSystemId,
      externalIdColumn: competitionGroupExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: CompetitionGroupUpsertConflictError,
      entityLabelPlural: 'competition groups',
      buildExternalIdRow: (competitionGroupId, externalId) => ({
        competitionGroupId,
        ...externalId,
      }),
    });

    return { competitionGroup, created };
  }

  /**
   * Resolve one external-id pair to the competition group that already
   * declares it. A group's identity is its curated name under the synthetic
   * "Name" system, so this is how a trophy or competition entry naming a
   * group finds it — including across import phases and tools.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: competitionGroupExternalIds,
      ownerIdColumn: competitionGroupExternalIds.competitionGroupId,
      externalSystemIdColumn: competitionGroupExternalIds.externalSystemId,
      externalIdColumn: competitionGroupExternalIds.externalId,
      externalIds,
    });
  }
}

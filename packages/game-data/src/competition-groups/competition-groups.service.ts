import type {
  ExternalId,
  ResolveResult,
  UpsertCompetitionGroup,
} from '@blood-bowl-tracker/api-contract';
import type { CompetitionGroup, Db } from '@blood-bowl-tracker/db';
import {
  competitionGroupExternalIds,
  competitionGroups,
  competitions,
  DB,
  leagues,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { count, eq, ilike } from 'drizzle-orm';

import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class CompetitionGroupUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class CompetitionGroupsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  /**
   * Every curated competition group, in the shape the API contract's
   * `CompetitionGroupSchema` declares. Projected in the query rather than
   * mapped afterward — the same pattern as `listByLeague` and
   * `searchByNamePrefix` below — so the history-tracking columns the contract
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

  /** One competition group's deepdive header, or `undefined` when no such group exists. */
  async findByIdWithLeague(id: number): Promise<
    | {
        id: number;
        name: string;
        leagueId: number;
        leagueName: string;
      }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: competitionGroups.id,
        name: competitionGroups.name,
        leagueId: competitionGroups.leagueId,
        leagueName: leagues.name,
      })
      .from(competitionGroups)
      .innerJoin(leagues, eq(leagues.id, competitionGroups.leagueId))
      .where(eq(competitionGroups.id, id));
    return rows[0];
  }

  /**
   * Every competition group belonging to one league, ordered by name. The
   * league deepdive lists these and offers a drill-down button each; it needs
   * no more than the id and label, mirroring
   * `TrophiesService.listByCompetitionGroup`.
   */
  listByLeague(leagueId: number): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: competitionGroups.id, name: competitionGroups.name })
      .from(competitionGroups)
      .where(eq(competitionGroups.leagueId, leagueId))
      .orderBy(competitionGroups.name);
  }

  /**
   * Every competition group with its league name and how many competitions
   * belong to it, for the `/insights competitionGroups.list` fact. Left-joins
   * competitions so a group with zero competitions still appears with a
   * `competitionCount` of `0` rather than being dropped. Optionally narrowed
   * to one league, mirroring `TrophiesService.listAllWithLeague` and
   * `ErasService.listErasWithLeague`.
   */
  listAllWithLeagueAndCount(scope: FactScope): Promise<
    {
      id: number;
      name: string;
      leagueName: string;
      competitionCount: number;
    }[]
  > {
    return this.db
      .select({
        id: competitionGroups.id,
        name: competitionGroups.name,
        leagueName: leagues.name,
        competitionCount: count(competitions.id),
      })
      .from(competitionGroups)
      .innerJoin(leagues, eq(leagues.id, competitionGroups.leagueId))
      .leftJoin(
        competitions,
        eq(competitions.competitionGroupId, competitionGroups.id),
      )
      .where(
        scope.leagueId === undefined
          ? undefined
          : eq(competitionGroups.leagueId, scope.leagueId),
      )
      .groupBy(competitionGroups.id, leagues.name);
  }

  /**
   * Case-insensitive prefix search for the `/deepdive competition-group:`
   * autocomplete. Mirrors `ErasService.searchByNamePrefix`: the caller's raw
   * text is escaped before it becomes an ILIKE pattern, so `%`/`_` match
   * literally.
   */
  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string; leagueName: string }[]> {
    return this.db
      .select({
        id: competitionGroups.id,
        name: competitionGroups.name,
        leagueName: leagues.name,
      })
      .from(competitionGroups)
      .innerJoin(leagues, eq(leagues.id, competitionGroups.leagueId))
      .where(
        ilike(competitionGroups.name, `${this.likePattern.escape(prefix)}%`),
      )
      .orderBy(competitionGroups.name)
      .limit(limit);
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
      values: { name: data.name, leagueId: data.leagueId },
      externalIdTable: competitionGroupExternalIds,
      ownerIdColumn: competitionGroupExternalIds.competitionGroupId,
      externalSystemIdColumn: competitionGroupExternalIds.externalSystemId,
      externalIdColumn: competitionGroupExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: CompetitionGroupUpsertConflictError,
      entityLabelPlural: 'competition groups',
      buildExternalIdRow: (competitionGroupId, pair) => ({
        competitionGroupId,
        ...pair,
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

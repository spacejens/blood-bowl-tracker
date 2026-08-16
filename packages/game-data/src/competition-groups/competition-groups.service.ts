import type { UpsertCompetitionGroup } from '@blood-bowl-tracker/api-contract';
import type { CompetitionGroup, Db } from '@blood-bowl-tracker/db';
import {
  competitionGroupExternalIds,
  competitionGroups,
  DB,
  leagues,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike } from 'drizzle-orm';

import { LikePatternService } from '../shared/like-pattern.service';
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
   * Every curated competition group. The only read in this service: an
   * importer that holds a competition's `competitionGroupId` needs the
   * group's curated *name* to build a trophy's TP external id
   * (`${disambiguator}-${groupName}`), and the group catalog is 16 rows, so
   * one unfiltered read per import run is cheaper and simpler than a
   * per-competition lookup.
   */
  async listAll(): Promise<CompetitionGroup[]> {
    return this.db.select().from(competitionGroups);
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
}

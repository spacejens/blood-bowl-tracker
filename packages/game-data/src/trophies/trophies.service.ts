import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import type { Db, Trophy } from '@blood-bowl-tracker/db';
import {
  competitionGroups,
  DB,
  leagues,
  trophies,
  trophyExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, ilike, or } from 'drizzle-orm';

import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class TrophyUpsertConflictError extends UpsertConflictError {}

/**
 * A single trophy's display header, with whichever scope it carries
 * resolved. Exactly one of the two pairs is populated: a group-scoped trophy
 * names its competition group, a league-scoped one names its league. The
 * database's `trophies_group_or_league` check is what guarantees that.
 */
export type TrophyHeader = {
  id: number;
  name: string;
  description: string | null;
  competitionGroupId: number | null;
  competitionGroupName: string | null;
  leagueId: number | null;
  leagueName: string | null;
};

@Injectable()
export class TrophiesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  /**
   * Case-insensitive prefix search for the `/deepdive trophy:` autocomplete.
   * Mirrors `ErasService.searchByNamePrefix`: the caller's raw text is escaped
   * before it becomes an ILIKE pattern, so `%`/`_` match literally.
   */
  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<
    {
      id: number;
      name: string;
      competitionGroupId: number | null;
      competitionGroupName: string | null;
      leagueName: string | null;
    }[]
  > {
    return (
      this.db
        .select({
          id: trophies.id,
          name: trophies.name,
          competitionGroupId: trophies.competitionGroupId,
          competitionGroupName: competitionGroups.name,
          leagueName: leagues.name,
        })
        .from(trophies)
        // Both joins are outer: a trophy carries exactly one of the two scopes,
        // so an inner join on either would drop every trophy of the other kind.
        .leftJoin(
          competitionGroups,
          eq(competitionGroups.id, trophies.competitionGroupId),
        )
        .leftJoin(leagues, eq(leagues.id, trophies.leagueId))
        .where(ilike(trophies.name, `${this.likePattern.escape(prefix)}%`))
        .orderBy(trophies.name)
        .limit(limit)
    );
  }

  /** One trophy's deepdive header, or `undefined` when no such trophy exists. */
  async findById(trophyId: number): Promise<TrophyHeader | undefined> {
    const rows = await this.db
      .select({
        id: trophies.id,
        name: trophies.name,
        description: trophies.description,
        competitionGroupId: trophies.competitionGroupId,
        competitionGroupName: competitionGroups.name,
        leagueId: trophies.leagueId,
        leagueName: leagues.name,
      })
      .from(trophies)
      // Outer for the same reason as in `searchByNamePrefix`.
      .leftJoin(
        competitionGroups,
        eq(competitionGroups.id, trophies.competitionGroupId),
      )
      .leftJoin(leagues, eq(leagues.id, trophies.leagueId))
      .where(eq(trophies.id, trophyId));
    return rows[0];
  }

  /**
   * Every trophy a competition group awards, ordered by name. The competition
   * group deepdive lists these and offers a drill-down button each; it needs
   * no more than the id and label.
   */
  listByCompetitionGroup(
    competitionGroupId: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: trophies.id, name: trophies.name })
      .from(trophies)
      .where(eq(trophies.competitionGroupId, competitionGroupId))
      .orderBy(trophies.name);
  }

  /**
   * Every trophy scoped to a league rather than to one of its competition
   * groups, ordered by name. The league deepdive lists these and offers a
   * drill-down button each, and the competition group deepdive folds them in
   * alongside its own group-scoped trophies — a league-scoped trophy can be
   * awarded in any competition in that league. Mirrors
   * `listByCompetitionGroup`: id and label are all a button needs.
   */
  listByLeague(leagueId: number): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: trophies.id, name: trophies.name })
      .from(trophies)
      .where(eq(trophies.leagueId, leagueId))
      .orderBy(trophies.name);
  }

  /**
   * The whole curated trophy catalog, each row carrying whichever scope
   * awards it — its competition group, or its league when the trophy is
   * league-scoped. Both joins are outer for the same reason as in
   * `findById`: a trophy has exactly one of the two scopes, so an inner join
   * on either would silently drop every trophy of the other kind.
   *
   * Scoping to a league matches a trophy either through its competition
   * group's own `leagueId` or through the trophy's own, so a league-scoped
   * trophy is included when the catalog is narrowed to its league. Ordering
   * is left to the caller, which sorts by scope name then trophy name for
   * display.
   */
  listAllWithLeague(scope: FactScope): Promise<
    {
      id: number;
      name: string;
      competitionGroupId: number | null;
      competitionGroupName: string | null;
      leagueId: number | null;
      leagueName: string | null;
    }[]
  > {
    const scopeLeagueId = scope.leagueId;
    return this.db
      .select({
        id: trophies.id,
        name: trophies.name,
        competitionGroupId: trophies.competitionGroupId,
        competitionGroupName: competitionGroups.name,
        leagueId: trophies.leagueId,
        leagueName: leagues.name,
      })
      .from(trophies)
      .leftJoin(
        competitionGroups,
        eq(competitionGroups.id, trophies.competitionGroupId),
      )
      .leftJoin(leagues, eq(leagues.id, trophies.leagueId))
      .where(
        scopeLeagueId === undefined
          ? undefined
          : or(
              eq(competitionGroups.leagueId, scopeLeagueId),
              eq(trophies.leagueId, scopeLeagueId),
            ),
      );
  }

  async upsert(
    data: UpsertTrophy,
  ): Promise<{ trophy: Trophy; created: boolean }> {
    const { row: trophy, created } = await upsertByExternalIds<
      typeof trophies,
      typeof trophyExternalIds
    >({
      db: this.db,
      entityTable: trophies,
      entityIdColumn: trophies.id,
      values: {
        name: data.name,
        recipientKind: data.recipientKind,
        description: data.description,
        competitionGroupId: data.competitionGroupId,
        leagueId: data.leagueId,
      },
      externalIdTable: trophyExternalIds,
      ownerIdColumn: trophyExternalIds.trophyId,
      externalSystemIdColumn: trophyExternalIds.externalSystemId,
      externalIdColumn: trophyExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: TrophyUpsertConflictError,
      entityLabelPlural: 'trophies',
      buildExternalIdRow: (trophyId, pair) => ({ trophyId, ...pair }),
    });

    return { trophy, created };
  }
}

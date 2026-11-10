import type { Db } from '@blood-bowl-tracker/db';
import {
  competitionGroups,
  competitions,
  count,
  countDistinct,
  DB,
  eq,
  ilike,
  leagues,
} from '@blood-bowl-tracker/db';
import type { FactScope } from '@blood-bowl-tracker/game-data';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';

/**
 * Read-only competition group lookups, listings and scoped counts for the
 * Discord bot. Competition group ingestion and the importers' listings are
 * `CompetitionGroupsService` in packages/game-data.
 */
@Injectable()
export class CompetitionGroupsQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

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
   * `TrophiesQueriesService.listByCompetitionGroup`.
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
   * to one league, mirroring `TrophiesQueriesService.listAllWithLeague` and
   * `ErasQueriesService.listErasWithLeague`.
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
   * autocomplete. Mirrors `ErasQueriesService.searchByNamePrefix`: the caller's raw
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
   * The counts behind the stats summary's `Competition groups:` line. There
   * is deliberately no competition-scoped variant: a competition belongs to
   * exactly one group (`competitions.competitionGroupId` is NOT NULL), so
   * that view renders the literal 1, the same way it renders `Leagues: 1`.
   */
  countAll(): Promise<number> {
    return countRows(this.db, competitionGroups);
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(competitionGroups)
      .where(eq(competitionGroups.leagueId, leagueId));
    return row.count;
  }

  /**
   * A group has no era of its own — it reaches one only through the
   * competitions it runs — so this counts the distinct groups that have at
   * least one competition in the era.
   */
  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(competitions.competitionGroupId) })
      .from(competitions)
      .where(eq(competitions.eraId, eraId));
    return row.count;
  }
}

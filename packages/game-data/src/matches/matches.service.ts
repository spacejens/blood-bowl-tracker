import type {
  MatchCategory,
  UpsertMatch,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Match } from '@blood-bowl-tracker/db';
import {
  competitions,
  DB,
  eras,
  matches,
  matchEvents,
  matchExternalIds,
  matchTeams,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { count, countDistinct, eq } from 'drizzle-orm';

import type { CompetitionType } from '../shared/competition-types';
import { countRows } from '../shared/count-all';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class MatchUpsertConflictError extends UpsertConflictError {}

/**
 * A match's category does not fit its competition's type (e.g. `cup_final`
 * on a season, or any `season_*` stage on a cup). Enforced here rather than
 * in the database: Postgres cannot cross-reference `competitions` from a
 * plain `check()` on `matches`, and a trigger was judged not worth the
 * complexity (see docs/plans and packages/db/src/schema/matches.ts).
 */
export class MatchCategoryMismatchError extends Error {}

/** Competition types each category is allowed on. `normal` fits both. */
const ALLOWED_COMPETITION_TYPES: Record<
  MatchCategory,
  readonly CompetitionType[]
> = {
  normal: ['season', 'cup'],
  cup_final: ['cup'],
  season_semi_final: ['season'],
  season_final: ['season'],
  season_bronze: ['season'],
  season_qualifier: ['season'],
};

export interface MatchWithTeamEras extends Match {
  teamEraIds: number[];
}

@Injectable()
export class MatchesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertMatch,
  ): Promise<{ match: MatchWithTeamEras; created: boolean }> {
    await this.assertCategoryFitsCompetition(data);
    const { row: match, created } = await upsertByExternalIds<
      typeof matches,
      typeof matchExternalIds
    >({
      db: this.db,
      entityTable: matches,
      entityIdColumn: matches.id,
      values: {
        competitionId: data.competitionId,
        playedAt: data.playedAt,
        name: data.name,
        category: data.category,
      },
      externalIdTable: matchExternalIds,
      ownerIdColumn: matchExternalIds.matchId,
      externalSystemIdColumn: matchExternalIds.externalSystemId,
      externalIdColumn: matchExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: MatchUpsertConflictError,
      entityLabelPlural: 'matches',
      buildExternalIdRow: (matchId, pair) => ({ matchId, ...pair }),
    });

    const teamEraIds = await this.syncTeams(match.id, data.teamEraIds);
    return { match: { ...match, teamEraIds }, created };
  }

  /**
   * Throws when `data`'s category cannot occur in `data`'s competition. Runs
   * only when the payload names both — an overlay update that mentions
   * neither has nothing to check against.
   */
  private async assertCategoryFitsCompetition(
    data: UpsertMatch,
  ): Promise<void> {
    const { category, competitionId } = data;
    if (category === undefined || competitionId === undefined) {
      return;
    }
    const [competition] = await this.db
      .select({ type: competitions.type })
      .from(competitions)
      .where(eq(competitions.id, competitionId));
    if (competition === undefined) {
      throw new MatchCategoryMismatchError(
        `Cannot set match category "${category}": competition ${competitionId} does not exist.`,
      );
    }
    if (!ALLOWED_COMPETITION_TYPES[category].includes(competition.type)) {
      throw new MatchCategoryMismatchError(
        `Match category "${category}" is not valid for a competition of type ` +
          `"${competition.type}" (competition ${competitionId}).`,
      );
    }
  }

  private async syncTeams(
    matchId: number,
    teamEraIds: number[],
  ): Promise<number[]> {
    const existing = await this.db
      .select({ teamEraId: matchTeams.teamEraId })
      .from(matchTeams)
      .where(eq(matchTeams.matchId, matchId));

    const existingIds = existing.map((r) => r.teamEraId);
    const existingSet = new Set(existingIds);
    const toInsert = teamEraIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await this.db
        .insert(matchTeams)
        .values(toInsert.map((teamEraId) => ({ matchId, teamEraId })));
    }

    return [...existingIds, ...toInsert];
  }

  countAll(): Promise<number> {
    return countRows(this.db, matches);
  }

  countMatchEvents(): Promise<number> {
    return countRows(this.db, matchEvents);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchTeams.matchId) })
      .from(matchTeams)
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countMatchEventsByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchEvents.id) })
      .from(matchEvents)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matchEvents.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchTeams.matchId) })
      .from(matchTeams)
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countMatchEventsByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchEvents.id) })
      .from(matchEvents)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matchEvents.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(matches)
      .where(eq(matches.competitionId, competitionId));
    return row.count;
  }

  async countMatchEventsByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchEvents.id) })
      .from(matchEvents)
      .innerJoin(matches, eq(matches.id, matchEvents.matchId))
      .where(eq(matches.competitionId, competitionId));
    return row.count;
  }
}

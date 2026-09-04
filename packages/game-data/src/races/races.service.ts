import type {
  ExternalId,
  ResolveResult,
  UpsertRace,
} from '@blood-bowl-tracker/api-contract';
import type { Race } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  eras,
  matches,
  matchTeams,
  positions,
  positionsRaceEras,
  raceEras,
  raceExternalIds,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, countDistinct, desc, eq, ilike } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import type { FactScope } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { MatchOutcomeCountsService } from '../shared/match-outcome-counts.service';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class RaceUpsertConflictError extends UpsertConflictError {}

export interface RaceWithEras extends Race {
  eras: number[];
}

/**
 * One position available to a race in one era. Flat, already ordered by era
 * then position name — the same shape `CompetitionsService.listByCompetitionGroupChronological`
 * returns, so a consumer groups it into per-era sections with the shared
 * `EraSectionGrouperService` rather than this service doing that grouping
 * itself.
 */
export interface RacePosition {
  id: number;
  name: string;
  eraId: number;
  eraName: string;
}

@Injectable()
export class RacesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
    private readonly matchOutcomeCounts: MatchOutcomeCountsService,
  ) {}

  async findById(
    id: number,
  ): Promise<{ id: number; name: string } | undefined> {
    const rows = await this.db
      .select({ id: races.id, name: races.name })
      .from(races)
      .where(eq(races.id, id));
    return rows[0];
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: races.id, name: races.name })
      .from(races)
      .where(ilike(races.name, `${this.likePattern.escape(prefix)}%`))
      .limit(limit);
  }

  async listEras(raceId: number): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: eras.id, name: eras.name })
      .from(raceEras)
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(eq(raceEras.raceId, raceId))
      .orderBy(eras.startDate, eras.name);
  }

  /**
   * Every ordinary (non-star) position available to this race, oldest era
   * first and positions name-ascending within each. Eras with no recorded
   * positions do not appear at all — the inner joins drop them, and an era
   * with nothing to list would render as an empty line. Star positions are
   * excluded: they are shared across every race that can hire them rather
   * than belonging to this one race, and are already reachable from their
   * own star-player deep dive.
   *
   * Flat and already ordered, matching how `CompetitionsService.listByCompetitionGroupChronological`
   * shapes its own rows — the caller groups this into per-era sections with
   * `EraSectionGrouperService`, the same way that competitions list does.
   */
  listPositionsByEra(raceId: number): Promise<RacePosition[]> {
    return this.db
      .select({
        id: positions.id,
        name: positions.name,
        eraId: eras.id,
        eraName: eras.name,
      })
      .from(raceEras)
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.raceEraId, raceEras.id),
      )
      .innerJoin(positions, eq(positions.id, positionsRaceEras.positionId))
      .where(
        and(eq(raceEras.raceId, raceId), eq(positions.isStarPlayer, false)),
      )
      .orderBy(asc(eras.startDate), asc(eras.name), asc(positions.name));
  }

  getTopTeamsByMatchesPlayed(
    raceId: number,
    limit: number,
  ): Promise<{ id: number; name: string; count: number }[]> {
    return this.db
      .select({
        id: teams.id,
        name: teams.name,
        count: countDistinct(matches.id),
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.raceId, raceId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(matches.id)))
      .limit(limit);
  }

  async upsert(
    data: UpsertRace,
  ): Promise<{ race: RaceWithEras; created: boolean }> {
    const { row: race, created } = await upsertByExternalIds<
      typeof races,
      typeof raceExternalIds
    >({
      db: this.db,
      entityTable: races,
      entityIdColumn: races.id,
      values: { name: data.name },
      externalIdTable: raceExternalIds,
      ownerIdColumn: raceExternalIds.raceId,
      externalSystemIdColumn: raceExternalIds.externalSystemId,
      externalIdColumn: raceExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: RaceUpsertConflictError,
      entityLabelPlural: 'races',
      buildExternalIdRow: (raceId, pair) => ({ raceId, ...pair }),
    });

    const eras = await this.syncEras(race.id, data.eras);
    return { race: { ...race, eras }, created };
  }

  /**
   * Resolve one external-id pair to the race that already declares it. The
   * read-only half of what `upsert` does internally, exposed on its own so a
   * caller can reference a race imported in an earlier run, phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: raceExternalIds,
      ownerIdColumn: raceExternalIds.raceId,
      externalSystemIdColumn: raceExternalIds.externalSystemId,
      externalIdColumn: raceExternalIds.externalId,
      externalIds,
    });
  }

  private async syncEras(raceId: number, eraIds: number[]): Promise<number[]> {
    const existing = await this.db
      .select({ eraId: raceEras.eraId })
      .from(raceEras)
      .where(eq(raceEras.raceId, raceId));

    const existingIds = existing.map((r) => r.eraId);
    const existingSet = new Set(existingIds);
    const toInsert = eraIds.filter((id) => !existingSet.has(id));

    if (toInsert.length > 0) {
      await this.db
        .insert(raceEras)
        .values(toInsert.map((eraId) => ({ raceId, eraId })));
    }

    return [...existingIds, ...toInsert];
  }

  async countTeamsByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    const base = this.db
      .select({
        raceId: races.id,
        name: races.name,
        count: countDistinct(teams.id),
      })
      .from(races)
      .innerJoin(teams, eq(teams.raceId, races.id));
    if (scope.leagueId !== undefined) {
      return base
        .innerJoin(teamEras, eq(teamEras.teamId, teams.id))
        .innerJoin(
          eras,
          and(eq(eras.id, teamEras.eraId), eq(eras.leagueId, scope.leagueId)),
        )
        .groupBy(races.id, races.name)
        .orderBy(desc(countDistinct(teams.id)))
        .limit(limit);
    }
    if (scope.eraId !== undefined) {
      return base
        .innerJoin(
          teamEras,
          and(eq(teamEras.teamId, teams.id), eq(teamEras.eraId, scope.eraId)),
        )
        .groupBy(races.id, races.name)
        .orderBy(desc(countDistinct(teams.id)))
        .limit(limit);
    }
    return base
      .groupBy(races.id, races.name)
      .orderBy(desc(countDistinct(teams.id)))
      .limit(limit);
  }

  async countMatchesPlayedByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    return (
      this.db
        .select({
          raceId: races.id,
          name: races.name,
          count: countDistinct(matchTeams.id),
        })
        .from(matchTeams)
        .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
        .innerJoin(eras, eq(eras.id, teamEras.eraId))
        .innerJoin(teams, eq(teams.id, teamEras.teamId))
        .innerJoin(races, eq(races.id, teams.raceId))
        // matchTeams.matchId is a non-null foreign key, so this join drops no
        // rows; it is unconditional (and last, keeping the earlier join indices
        // stable) purely to expose matches.category to the filter below.
        .innerJoin(matches, eq(matches.id, matchTeams.matchId))
        .where(
          and(
            scope.leagueId === undefined
              ? undefined
              : eq(eras.leagueId, scope.leagueId),
            scope.eraId === undefined
              ? undefined
              : eq(teamEras.eraId, scope.eraId),
            scope.category === undefined
              ? undefined
              : eq(matches.category, scope.category),
          ),
        )
        .groupBy(races.id, races.name)
        .orderBy(desc(countDistinct(matchTeams.id)))
        .limit(limit)
    );
  }

  /**
   * The won/lost/drawn siblings of `countMatchesPlayedByRace`. Like that
   * query these count one participation per participating team, so a drawn
   * match between two teams of the same race adds 2 to that race's total.
   * See `MatchOutcomeCountsService`.
   */
  countMatchesWonByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByRace({
      outcome: 'won',
      scope,
      limit,
    });
  }

  countMatchesLostByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByRace({
      outcome: 'lost',
      scope,
      limit,
    });
  }

  countMatchesDrawnByRace(
    scope: FactScope,
    limit: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    return this.matchOutcomeCounts.countMatchesWithOutcomeByRace({
      outcome: 'drawn',
      scope,
      limit,
    });
  }

  countAll(): Promise<number> {
    return countRows(this.db, races);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(raceEras.raceId) })
      .from(raceEras)
      .where(eq(raceEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(raceEras.raceId) })
      .from(raceEras)
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.raceId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}

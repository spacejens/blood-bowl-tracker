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
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  max,
  sql,
} from 'drizzle-orm';

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

/** One race and how many teams have ever picked it. */
export interface RaceTeamCount {
  raceId: number;
  name: string;
  count: number;
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

  /**
   * The races usable under this scope, as a one-column subquery of race ids.
   * Availability comes from `race_eras` — which eras a race may be played in
   * — never from whether anyone has ever picked it, so a race with no teams
   * at all is still a candidate.
   *
   * The `eras` join is unconditional: `raceEras.eraId` is a non-null foreign
   * key so it drops no rows, and it is what exposes `eras.leagueId` to the
   * league filter. Only called when at least one of the two scopes is set —
   * with neither, every race is available and no filter is applied at all.
   */
  private availableRaceIds(scope: FactScope) {
    return this.db
      .select({ raceId: raceEras.raceId })
      .from(raceEras)
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(
        and(
          scope.leagueId === undefined
            ? undefined
            : eq(eras.leagueId, scope.leagueId),
          scope.eraId === undefined
            ? undefined
            : eq(raceEras.eraId, scope.eraId),
        ),
      );
  }

  /**
   * How many teams have ever picked each race, as a subquery. Deliberately
   * unscoped: the league/era scope decides which races are listed, never what
   * number is shown beside a listed race. `countDistinct` guards the count
   * against any future join here multiplying rows per team.
   */
  private allTimeTeamCountsByRace() {
    return this.db
      .select({
        raceId: teams.raceId,
        count: countDistinct(teams.id).as('count'),
      })
      .from(teams)
      .groupBy(teams.raceId)
      .as('race_team_counts');
  }

  /**
   * The most recent match any team of each race ever played, as a subquery —
   * the tiebreaker between races on equal counts. All-time, for the same
   * reason the counts are: a tiebreaker scoped differently from the value it
   * breaks ties on would rank two equal rows by an unrelated measure.
   */
  private allTimeLatestMatchByRace() {
    return this.db
      .select({
        raceId: teams.raceId,
        latestMatch: max(matches.playedAt).as('latest_match'),
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .groupBy(teams.raceId)
      .as('race_latest_matches');
  }

  /**
   * `direction` is the only difference between the two public toplists: they
   * are the same metric read from opposite ends. Both subqueries are
   * left-joined so a race with no teams — or no match — is ranked at zero
   * rather than dropped, which is the whole point of the ascending list.
   * A final tiebreak by race name (always ascending, regardless of
   * `direction`) keeps the ranking deterministic once both the count and the
   * latest-match date are tied — the common case for never-picked races,
   * which is the whole point of the ascending list.
   */
  private rankRacesByTeamCount(
    scope: FactScope,
    limit: number,
    direction: 'asc' | 'desc',
  ): Promise<RaceTeamCount[]> {
    const available =
      scope.leagueId === undefined && scope.eraId === undefined
        ? undefined
        : inArray(races.id, this.availableRaceIds(scope));
    const counts = this.allTimeTeamCountsByRace();
    const latest = this.allTimeLatestMatchByRace();
    const count = sql<number>`coalesce(${counts.count}, 0)::int`;
    const order = direction === 'desc' ? desc : asc;
    return this.db
      .select({ raceId: races.id, name: races.name, count })
      .from(races)
      .leftJoin(counts, eq(counts.raceId, races.id))
      .leftJoin(latest, eq(latest.raceId, races.id))
      .where(available)
      .orderBy(order(count), order(latest.latestMatch), asc(races.name))
      .limit(limit);
  }

  /** The races the most teams have ever picked, most-picked first. */
  countTeamsByRaceDescending(
    scope: FactScope,
    limit: number,
  ): Promise<RaceTeamCount[]> {
    return this.rankRacesByTeamCount(scope, limit, 'desc');
  }

  /**
   * The same metric read from the other end: the races hardly anyone picks,
   * including any race nobody has ever picked at all.
   */
  countTeamsByRaceAscending(
    scope: FactScope,
    limit: number,
  ): Promise<RaceTeamCount[]> {
    return this.rankRacesByTeamCount(scope, limit, 'asc');
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

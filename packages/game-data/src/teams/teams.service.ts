import type { UpsertTeam } from '@blood-bowl-tracker/api-contract';
import type { Db, Team } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitions,
  competitionTeams,
  DB,
  eras,
  matches,
  matchTeams,
  races,
  teamEras,
  teamExternalIds,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, countDistinct, desc, eq, ilike, sql } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { escapeLikePattern } from '../shared/escape-like-pattern';
import type { FactScope } from '../shared/fact-scope';
import {
  countAllMatchEventsByPlayerForTeam,
  countMatchEventsByTeam,
  listBiggestExpensiveMistakes as queryListBiggestExpensiveMistakes,
  sumExpensiveMistakesByTeam as querySumExpensiveMistakesByTeam,
} from '../shared/match-event-counts';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEATH_SUFFERED_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SENT_OFF_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class TeamUpsertConflictError extends UpsertConflictError {}

export interface TeamWithEras extends Team {
  eras: { id: number; eraId: number }[];
}

@Injectable()
export class TeamsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertTeam,
  ): Promise<{ team: TeamWithEras; created: boolean }> {
    const { row: team, created } = await upsertByExternalIds<
      typeof teams,
      typeof teamExternalIds
    >({
      db: this.db,
      entityTable: teams,
      entityIdColumn: teams.id,
      values: {
        name: data.name,
        raceId: data.raceId,
        coachId: data.coachId,
      },
      externalIdTable: teamExternalIds,
      ownerIdColumn: teamExternalIds.teamId,
      externalSystemIdColumn: teamExternalIds.externalSystemId,
      externalIdColumn: teamExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: TeamUpsertConflictError,
      entityLabelPlural: 'teams',
      buildExternalIdRow: (teamId, pair) => ({ teamId, ...pair }),
    });

    const eras = await this.syncEras(team.id, data.eras);
    return { team: { ...team, eras }, created };
  }

  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(ilike(teams.name, `${escapeLikePattern(prefix)}%`))
      .limit(limit);
  }

  async findById(id: number): Promise<
    | {
        id: number;
        name: string;
        raceName: string;
        raceId: number;
        coachName: string;
        coachId: number;
      }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: teams.id,
        name: teams.name,
        raceName: races.name,
        raceId: races.id,
        coachName: coaches.name,
        coachId: coaches.id,
      })
      .from(teams)
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(eq(teams.id, id));
    return rows[0];
  }

  async getCareerSpan(
    teamId: number,
  ): Promise<{ start: string; end: string } | undefined> {
    // Aggregate over zero rows still returns one row with null start/end, so a
    // null start marks a team that has recorded no matches. Casting to ::date
    // yields YYYY-MM-DD strings the resolver can render directly.
    const [row] = await this.db
      .select({
        start: sql<string | null>`min(${matches.playedAt})::date`,
        end: sql<string | null>`max(${matches.playedAt})::date`,
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teams.id, teamId));
    if (row === undefined || row.start === null || row.end === null) {
      return undefined;
    }
    return { start: row.start, end: row.end };
  }

  getTopPlayersByMatchEventCount(
    teamId: number,
    limit: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countAllMatchEventsByPlayerForTeam({ db: this.db, teamId, limit });
  }

  async countMatchesPlayedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: countDistinct(matches.id),
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(
        and(
          scope.leagueId === undefined
            ? undefined
            : eq(eras.leagueId, scope.leagueId),
          scope.eraId === undefined
            ? undefined
            : eq(teamEras.eraId, scope.eraId),
        ),
      )
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(matches.id)))
      .limit(limit);
  }

  async countCompetitionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: countDistinct(competitions.id),
      })
      .from(competitions)
      .innerJoin(
        competitionTeams,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(
        and(
          scope.leagueId === undefined
            ? undefined
            : eq(eras.leagueId, scope.leagueId),
          scope.eraId === undefined
            ? undefined
            : eq(teamEras.eraId, scope.eraId),
        ),
      )
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(competitions.id)))
      .limit(limit);
  }

  async countErasByTeam(
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: countDistinct(teamEras.eraId),
      })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(teamEras.eraId)))
      .limit(limit);
  }

  countTouchdownsScoredByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: TOUCHDOWN_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countCompletionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: COMPLETION_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countInterceptionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: INTERCEPTION_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countDeflectionsByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: DEFLECTION_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countCasualtiesCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: CASUALTY_CAUSED_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countSeriousInjuriesCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: SERIOUS_INJURY_CAUSED_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countDeathsCausedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: DEATH_CAUSED_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countFoulsCommittedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'acting', types: FOUL_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countTimesSentOffByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: SENT_OFF_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countCasualtiesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: CASUALTY_SUFFERED_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countSeriousInjuriesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: SERIOUS_INJURY_SUFFERED_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countLastingInjuriesSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: LASTING_INJURY_SUFFERED_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countDeathsSufferedByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam({
      db: this.db,
      selector: { role: 'consequence', types: DEATH_SUFFERED_TYPES },
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  sumExpensiveMistakesByTeam(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return querySumExpensiveMistakesByTeam({
      db: this.db,
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  listBiggestExpensiveMistakes(
    scope: FactScope,
    limit: number,
  ): Promise<{ teamId: number; name: string; count: number; date: string }[]> {
    return queryListBiggestExpensiveMistakes({
      db: this.db,
      leagueId: scope.leagueId,
      eraId: scope.eraId,
      competitionId: scope.competitionId,
      limit,
    });
  }

  countAll(): Promise<number> {
    return countRows(this.db, teams);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teamEras.teamId) })
      .from(teamEras)
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teamEras.teamId) })
      .from(teamEras)
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teamEras.teamId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }

  private async syncEras(
    teamId: number,
    eraIds: number[],
  ): Promise<{ id: number; eraId: number }[]> {
    const existing = await this.db
      .select({ id: teamEras.id, eraId: teamEras.eraId })
      .from(teamEras)
      .where(eq(teamEras.teamId, teamId));

    const existingEraIds = new Set(existing.map((r) => r.eraId));
    const toInsert = eraIds.filter((eraId) => !existingEraIds.has(eraId));

    if (toInsert.length === 0) {
      return existing;
    }

    const inserted = await this.db
      .insert(teamEras)
      .values(toInsert.map((eraId) => ({ teamId, eraId })))
      .returning({ id: teamEras.id, eraId: teamEras.eraId });

    return [...existing, ...inserted];
  }
}

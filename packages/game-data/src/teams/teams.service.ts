import type { Db, Team } from '@blood-bowl-tracker/db';
import {
  competitions,
  competitionTeams,
  DB,
  matches,
  matchTeams,
  teamEras,
  teamExternalIds,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { countDistinct, desc, eq } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { countMatchEventsByTeam } from '../shared/match-event-counts';
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
import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

export class TeamUpsertConflictError extends Error {}

export interface UpsertTeamData {
  name: string;
  raceId: number;
  coachId: number;
  eras: number[];
  externalIds: { externalSystemId: number; externalId: string }[];
}

export interface TeamWithEras extends Team {
  eras: { id: number; eraId: number }[];
}

@Injectable()
export class TeamsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertTeamData,
  ): Promise<{ team: TeamWithEras; created: boolean }> {
    const { ownerIds, existingRows } = await resolveExistingByExternalIds(
      this.db,
      teamExternalIds,
      teamExternalIds.teamId,
      teamExternalIds.externalSystemId,
      teamExternalIds.externalId,
      data.externalIds,
    );

    if (ownerIds.length > 1) {
      throw new TeamUpsertConflictError(
        `External IDs matched multiple existing teams: ${ownerIds.join(', ')}`,
      );
    }

    const values = {
      name: data.name,
      raceId: data.raceId,
      coachId: data.coachId,
    };

    let team: Team;
    const created = ownerIds.length === 0;

    if (created) {
      const result = await this.db.insert(teams).values(values).returning();
      team = result[0];
    } else {
      const result = await this.db
        .update(teams)
        .set(values)
        .where(eq(teams.id, ownerIds[0]))
        .returning();
      team = result[0];
    }

    const eras = await this.syncEras(team.id, data.eras);
    await insertMissingExternalIds(
      this.db,
      teamExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ teamId: team.id, ...pair }),
    );

    return { team: { ...team, eras }, created };
  }

  async countMatchesPlayedByTeam(
    eraId?: number,
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
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eraId === undefined ? undefined : eq(teamEras.eraId, eraId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(matches.id)));
  }

  async countCompetitionsByTeam(
    eraId?: number,
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
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eraId === undefined ? undefined : eq(teamEras.eraId, eraId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(competitions.id)));
  }

  async countErasByTeam(): Promise<
    { teamId: number; name: string; count: number }[]
  > {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: countDistinct(teamEras.eraId),
      })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .groupBy(teams.id, teams.name)
      .orderBy(desc(countDistinct(teamEras.eraId)));
  }

  countTouchdownsScoredByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'acting', types: TOUCHDOWN_TYPES },
      eraId,
      competitionId,
    );
  }

  countCompletionsByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'acting', types: COMPLETION_TYPES },
      eraId,
      competitionId,
    );
  }

  countInterceptionsByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'acting', types: INTERCEPTION_TYPES },
      eraId,
      competitionId,
    );
  }

  countDeflectionsByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'acting', types: DEFLECTION_TYPES },
      eraId,
      competitionId,
    );
  }

  countCasualtiesCausedByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'acting', types: CASUALTY_CAUSED_TYPES },
      eraId,
      competitionId,
    );
  }

  countSeriousInjuriesCausedByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'acting', types: SERIOUS_INJURY_CAUSED_TYPES },
      eraId,
      competitionId,
    );
  }

  countDeathsCausedByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'acting', types: DEATH_CAUSED_TYPES },
      eraId,
      competitionId,
    );
  }

  countFoulsCommittedByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'acting', types: FOUL_TYPES },
      eraId,
      competitionId,
    );
  }

  countTimesSentOffByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'consequence', types: SENT_OFF_TYPES },
      eraId,
      competitionId,
    );
  }

  countCasualtiesSufferedByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'consequence', types: CASUALTY_SUFFERED_TYPES },
      eraId,
      competitionId,
    );
  }

  countSeriousInjuriesSufferedByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'consequence', types: SERIOUS_INJURY_SUFFERED_TYPES },
      eraId,
      competitionId,
    );
  }

  countLastingInjuriesSufferedByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'consequence', types: LASTING_INJURY_SUFFERED_TYPES },
      eraId,
      competitionId,
    );
  }

  countDeathsSufferedByTeam(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return countMatchEventsByTeam(
      this.db,
      { role: 'consequence', types: DEATH_SUFFERED_TYPES },
      eraId,
      competitionId,
    );
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

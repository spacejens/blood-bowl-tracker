import type { Db, Team } from '@blood-bowl-tracker/db';
import {
  competitions,
  competitionTeams,
  DB,
  matchEvents,
  matches,
  matchTeams,
  teamEras,
  teamExternalIds,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, countDistinct, desc, eq, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

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
    const existingRows = await this.db
      .select({
        teamId: teamExternalIds.teamId,
        externalSystemId: teamExternalIds.externalSystemId,
        externalId: teamExternalIds.externalId,
      })
      .from(teamExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(teamExternalIds.externalSystemId, e.externalSystemId),
              eq(teamExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctTeamIds = [...new Set(existingRows.map((r) => r.teamId))];

    if (distinctTeamIds.length > 1) {
      throw new TeamUpsertConflictError(
        `External IDs matched multiple existing teams: ${distinctTeamIds.join(', ')}`,
      );
    }

    const values = {
      name: data.name,
      raceId: data.raceId,
      coachId: data.coachId,
    };

    let team: Team;
    const created = distinctTeamIds.length === 0;

    if (created) {
      const result = await this.db.insert(teams).values(values).returning();
      team = result[0];
    } else {
      const result = await this.db
        .update(teams)
        .set(values)
        .where(eq(teams.id, distinctTeamIds[0]))
        .returning();
      team = result[0];
    }

    const eras = await this.syncEras(team.id, data.eras);
    await this.syncExternalIds(team.id, data.externalIds, existingRows);

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

  async countTouchdownsScoredByTeam(
    eraId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(
        and(
          eq(matchEvents.actionType, 'touchdown'),
          eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
        ),
      )
      .groupBy(teams.id, teams.name)
      .orderBy(desc(count(matchEvents.id)));
  }

  async countCompletionsByTeam(
    eraId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(
        and(
          eq(matchEvents.actionType, 'completion'),
          eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
        ),
      )
      .groupBy(teams.id, teams.name)
      .orderBy(desc(count(matchEvents.id)));
  }

  async countInterceptionsByTeam(
    eraId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(
        and(
          eq(matchEvents.actionType, 'interception'),
          eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
        ),
      )
      .groupBy(teams.id, teams.name)
      .orderBy(desc(count(matchEvents.id)));
  }

  async countDeflectionsByTeam(
    eraId?: number,
  ): Promise<{ teamId: number; name: string; count: number }[]> {
    return this.db
      .select({
        teamId: teams.id,
        name: teams.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(
        and(
          eq(matchEvents.actionType, 'deflection'),
          eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
        ),
      )
      .groupBy(teams.id, teams.name)
      .orderBy(desc(count(matchEvents.id)));
  }

  countAll(): Promise<number> {
    return countRows(this.db, teams);
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

  private async syncExternalIds(
    teamId: number,
    externalIds: { externalSystemId: number; externalId: string }[],
    existingRows: { externalSystemId: number; externalId: string }[],
  ): Promise<void> {
    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(teamExternalIds).values(
        newExternalIds.map((e) => ({
          teamId,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }
  }
}

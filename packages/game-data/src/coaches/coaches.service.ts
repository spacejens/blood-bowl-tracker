import type { Coach } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  coachExternalIds,
  competitions,
  competitionTeams,
  matches,
  matchTeams,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, countDistinct, desc, eq } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

export class CoachUpsertConflictError extends Error {}

export interface UpsertCoachData {
  name: string;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class CoachesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertCoachData,
  ): Promise<{ coach: Coach; created: boolean }> {
    const { ownerIds, existingRows } = await resolveExistingByExternalIds(
      this.db,
      coachExternalIds,
      coachExternalIds.coachId,
      coachExternalIds.externalSystemId,
      coachExternalIds.externalId,
      data.externalIds,
    );

    if (ownerIds.length > 1) {
      throw new CoachUpsertConflictError(
        `External IDs matched multiple existing coaches: ${ownerIds.join(', ')}`,
      );
    }

    let coach: Coach;
    const created = ownerIds.length === 0;

    if (created) {
      const result = await this.db
        .insert(coaches)
        .values({ name: data.name })
        .returning();
      coach = result[0];
    } else {
      const result = await this.db
        .update(coaches)
        .set({ name: data.name })
        .where(eq(coaches.id, ownerIds[0]))
        .returning();
      coach = result[0];
    }

    await insertMissingExternalIds(
      this.db,
      coachExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ coachId: coach.id, ...pair }),
    );

    return { coach, created };
  }

  async countMatchesPlayedByCoach(
    eraId?: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: countDistinct(matches.id),
      })
      .from(matches)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matches.id))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(eraId === undefined ? undefined : eq(teamEras.eraId, eraId))
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(countDistinct(matches.id)));
  }

  async countCompetitionsByCoach(
    eraId?: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    return this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: countDistinct(competitions.id),
      })
      .from(competitions)
      .innerJoin(
        competitionTeams,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(eraId === undefined ? undefined : eq(teamEras.eraId, eraId))
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(countDistinct(competitions.id)));
  }

  async countTeamsByCoach(
    eraId?: number,
  ): Promise<{ coachId: number; name: string; count: number }[]> {
    if (eraId === undefined) {
      return this.db
        .select({
          coachId: coaches.id,
          name: coaches.name,
          count: count(teams.id),
        })
        .from(coaches)
        .innerJoin(teams, eq(teams.coachId, coaches.id))
        .groupBy(coaches.id, coaches.name)
        .orderBy(desc(count(teams.id)));
    }
    return this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: count(teams.id),
      })
      .from(coaches)
      .innerJoin(teams, eq(teams.coachId, coaches.id))
      .innerJoin(
        teamEras,
        and(eq(teamEras.teamId, teams.id), eq(teamEras.eraId, eraId)),
      )
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(count(teams.id)));
  }

  async countErasByCoach(): Promise<
    { coachId: number; name: string; count: number }[]
  > {
    return this.db
      .select({
        coachId: coaches.id,
        name: coaches.name,
        count: countDistinct(teamEras.eraId),
      })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .groupBy(coaches.id, coaches.name)
      .orderBy(desc(countDistinct(teamEras.eraId)));
  }

  countAll(): Promise<number> {
    return countRows(this.db, coaches);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(teams.coachId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}

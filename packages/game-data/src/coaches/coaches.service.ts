import type { Coach } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  coachExternalIds,
  matches,
  matchTeams,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, countDistinct, desc, eq, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

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
    const existingRows = await this.db
      .select({
        coachId: coachExternalIds.coachId,
        externalSystemId: coachExternalIds.externalSystemId,
        externalId: coachExternalIds.externalId,
      })
      .from(coachExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(coachExternalIds.externalSystemId, e.externalSystemId),
              eq(coachExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctCoachIds = [...new Set(existingRows.map((r) => r.coachId))];

    if (distinctCoachIds.length > 1) {
      throw new CoachUpsertConflictError(
        `External IDs matched multiple existing coaches: ${distinctCoachIds.join(', ')}`,
      );
    }

    let coach: Coach;
    const created = distinctCoachIds.length === 0;

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
        .where(eq(coaches.id, distinctCoachIds[0]))
        .returning();
      coach = result[0];
    }

    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = data.externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(coachExternalIds).values(
        newExternalIds.map((e) => ({
          coachId: coach.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }

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

  countAll(): Promise<number> {
    return countRows(this.db, coaches);
  }
}

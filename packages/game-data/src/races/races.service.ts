import type { Race } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  matchTeams,
  raceEras,
  raceExternalIds,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, countDistinct, desc, eq } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

export class RaceUpsertConflictError extends Error {}

export interface UpsertRaceData {
  name: string;
  eras?: number[];
  externalIds: { externalSystemId: number; externalId: string }[];
}

export interface RaceWithEras extends Race {
  eras: number[];
}

@Injectable()
export class RacesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertRaceData,
  ): Promise<{ race: RaceWithEras; created: boolean }> {
    const { ownerIds: distinctRaceIds, existingRows } =
      await resolveExistingByExternalIds(
        this.db,
        raceExternalIds,
        raceExternalIds.raceId,
        raceExternalIds.externalSystemId,
        raceExternalIds.externalId,
        data.externalIds,
      );

    if (distinctRaceIds.length > 1) {
      throw new RaceUpsertConflictError(
        `External IDs matched multiple existing races: ${distinctRaceIds.join(', ')}`,
      );
    }

    let race: Race;
    const created = distinctRaceIds.length === 0;

    if (created) {
      const result = await this.db
        .insert(races)
        .values({ name: data.name })
        .returning();
      race = result[0];
    } else {
      const result = await this.db
        .update(races)
        .set({ name: data.name })
        .where(eq(races.id, distinctRaceIds[0]))
        .returning();
      race = result[0];
    }

    await insertMissingExternalIds(
      this.db,
      raceExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ raceId: race.id, ...pair }),
    );

    const eras = await this.syncEras(race.id, data.eras ?? []);
    return { race: { ...race, eras }, created };
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
    eraId?: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    if (eraId === undefined) {
      return this.db
        .select({
          raceId: races.id,
          name: races.name,
          count: count(teams.id),
        })
        .from(races)
        .innerJoin(teams, eq(teams.raceId, races.id))
        .groupBy(races.id, races.name)
        .orderBy(desc(count(teams.id)));
    }
    return this.db
      .select({
        raceId: races.id,
        name: races.name,
        count: count(teams.id),
      })
      .from(races)
      .innerJoin(teams, eq(teams.raceId, races.id))
      .innerJoin(
        teamEras,
        and(eq(teamEras.teamId, teams.id), eq(teamEras.eraId, eraId)),
      )
      .groupBy(races.id, races.name)
      .orderBy(desc(count(teams.id)));
  }

  async countMatchesPlayedByRace(
    eraId?: number,
  ): Promise<{ raceId: number; name: string; count: number }[]> {
    return this.db
      .select({
        raceId: races.id,
        name: races.name,
        count: count(matchTeams.id),
      })
      .from(matchTeams)
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(races, eq(races.id, teams.raceId))
      .where(eraId === undefined ? undefined : eq(teamEras.eraId, eraId))
      .groupBy(races.id, races.name)
      .orderBy(desc(count(matchTeams.id)));
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

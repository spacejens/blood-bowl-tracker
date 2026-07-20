import type { UpsertRace } from '@blood-bowl-tracker/api-contract';
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
import { and, count, countDistinct, desc, eq, ilike } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { escapeLikePattern } from '../shared/escape-like-pattern';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class RaceUpsertConflictError extends UpsertConflictError {}

export interface RaceWithEras extends Race {
  eras: number[];
}

@Injectable()
export class RacesService {
  constructor(@Inject(DB) private readonly db: Db) {}

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
      .where(ilike(races.name, `${escapeLikePattern(prefix)}%`))
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

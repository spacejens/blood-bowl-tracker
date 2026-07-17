import type { Db, Match } from '@blood-bowl-tracker/db';
import {
  DB,
  matches,
  matchEvents,
  matchExternalIds,
  matchTeams,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { count, countDistinct, eq } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

export class MatchUpsertConflictError extends Error {}

export interface UpsertMatchData {
  competitionId: number;
  playedAt: Date;
  name: string;
  externalIds: { externalSystemId: number; externalId: string }[];
  teamEraIds: number[];
}

export interface MatchWithTeamEras extends Match {
  teamEraIds: number[];
}

@Injectable()
export class MatchesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertMatchData,
  ): Promise<{ match: MatchWithTeamEras; created: boolean }> {
    const { ownerIds: distinctMatchIds, existingRows } =
      await resolveExistingByExternalIds(
        this.db,
        matchExternalIds,
        matchExternalIds.matchId,
        matchExternalIds.externalSystemId,
        matchExternalIds.externalId,
        data.externalIds,
      );

    if (distinctMatchIds.length > 1) {
      throw new MatchUpsertConflictError(
        `External IDs matched multiple existing matches: ${distinctMatchIds.join(', ')}`,
      );
    }

    const values = {
      competitionId: data.competitionId,
      playedAt: data.playedAt,
      name: data.name,
    };

    let match: Match;
    const created = distinctMatchIds.length === 0;

    if (created) {
      const result = await this.db.insert(matches).values(values).returning();
      match = result[0];
    } else {
      const result = await this.db
        .update(matches)
        .set(values)
        .where(eq(matches.id, distinctMatchIds[0]))
        .returning();
      match = result[0];
    }

    await insertMissingExternalIds(
      this.db,
      matchExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ matchId: match.id, ...pair }),
    );
    const teamEraIds = await this.syncTeams(match.id, data.teamEraIds);

    return { match: { ...match, teamEraIds }, created };
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

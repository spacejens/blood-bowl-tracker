import type { Db, Player } from '@blood-bowl-tracker/db';
import {
  DB,
  matchEvents,
  matchTeams,
  playerExternalIds,
  players,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, or } from 'drizzle-orm';

import { countRows } from '../shared/count-all';

export class PlayerUpsertConflictError extends Error {}

export interface UpsertPlayerData {
  name: string;
  teamEraId: number;
  positionId: number;
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class PlayersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: UpsertPlayerData,
  ): Promise<{ player: Player; created: boolean }> {
    const existingRows = await this.db
      .select({
        playerId: playerExternalIds.playerId,
        externalSystemId: playerExternalIds.externalSystemId,
        externalId: playerExternalIds.externalId,
      })
      .from(playerExternalIds)
      .where(
        or(
          ...data.externalIds.map((e) =>
            and(
              eq(playerExternalIds.externalSystemId, e.externalSystemId),
              eq(playerExternalIds.externalId, e.externalId),
            ),
          ),
        ),
      );

    const distinctPlayerIds = [...new Set(existingRows.map((r) => r.playerId))];

    if (distinctPlayerIds.length > 1) {
      throw new PlayerUpsertConflictError(
        `External IDs matched multiple existing players: ${distinctPlayerIds.join(', ')}`,
      );
    }

    let player: Player;
    const created = distinctPlayerIds.length === 0;
    const columns = {
      name: data.name,
      teamEraId: data.teamEraId,
      positionId: data.positionId,
    };

    if (created) {
      const result = await this.db.insert(players).values(columns).returning();
      player = result[0];
    } else {
      const result = await this.db
        .update(players)
        .set(columns)
        .where(eq(players.id, distinctPlayerIds[0]))
        .returning();
      player = result[0];
    }

    const existingPairs = new Set(
      existingRows.map((r) => `${r.externalSystemId}:${r.externalId}`),
    );
    const newExternalIds = data.externalIds.filter(
      (e) => !existingPairs.has(`${e.externalSystemId}:${e.externalId}`),
    );

    if (newExternalIds.length > 0) {
      await this.db.insert(playerExternalIds).values(
        newExternalIds.map((e) => ({
          playerId: player.id,
          externalSystemId: e.externalSystemId,
          externalId: e.externalId,
        })),
      );
    }

    return { player, created };
  }

  async countMvpAwardsByPlayer(
    eraId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.db
      .select({
        playerId: players.id,
        name: players.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(players, eq(players.id, matchEvents.actingPlayerId))
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(
        and(
          eq(matchEvents.actionType, 'mvp_award'),
          eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
        ),
      )
      .groupBy(players.id, players.name)
      .orderBy(desc(count(matchEvents.id)));
  }

  async countTouchdownsScoredByPlayer(
    eraId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.db
      .select({
        playerId: players.id,
        name: players.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(players, eq(players.id, matchEvents.actingPlayerId))
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(
        and(
          eq(matchEvents.actionType, 'touchdown'),
          eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
        ),
      )
      .groupBy(players.id, players.name)
      .orderBy(desc(count(matchEvents.id)));
  }

  async countCompletionsByPlayer(
    eraId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.db
      .select({
        playerId: players.id,
        name: players.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(players, eq(players.id, matchEvents.actingPlayerId))
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(
        and(
          eq(matchEvents.actionType, 'completion'),
          eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
        ),
      )
      .groupBy(players.id, players.name)
      .orderBy(desc(count(matchEvents.id)));
  }

  async countInterceptionsByPlayer(
    eraId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.db
      .select({
        playerId: players.id,
        name: players.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(players, eq(players.id, matchEvents.actingPlayerId))
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(
        and(
          eq(matchEvents.actionType, 'interception'),
          eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
        ),
      )
      .groupBy(players.id, players.name)
      .orderBy(desc(count(matchEvents.id)));
  }

  async countDeflectionsByPlayer(
    eraId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return this.db
      .select({
        playerId: players.id,
        name: players.name,
        count: count(matchEvents.id),
      })
      .from(matchEvents)
      .innerJoin(players, eq(players.id, matchEvents.actingPlayerId))
      .innerJoin(matchTeams, eq(matchTeams.id, matchEvents.actingMatchTeamId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(
        and(
          eq(matchEvents.actionType, 'deflection'),
          eraId === undefined ? undefined : eq(teamEras.eraId, eraId),
        ),
      )
      .groupBy(players.id, players.name)
      .orderBy(desc(count(matchEvents.id)));
  }

  countAll(): Promise<number> {
    return countRows(this.db, players);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count(players.id) })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }
}

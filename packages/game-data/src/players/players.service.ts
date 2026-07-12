import type { Db, Player } from '@blood-bowl-tracker/db';
import { DB, playerExternalIds, players } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

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

  countAll(): Promise<number> {
    return countRows(this.db, players);
  }
}

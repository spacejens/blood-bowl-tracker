import type { Db, Player } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  playerExternalIds,
  players,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { countMatchEventsByPlayer } from '../shared/match-event-counts';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  MVP_AWARD_TYPES,
  SENT_OFF_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';
import { insertMissingExternalIds } from '../shared/sync-external-ids';

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
    const { ownerIds: distinctPlayerIds, existingRows } =
      await resolveExistingByExternalIds(
        this.db,
        playerExternalIds,
        playerExternalIds.playerId,
        playerExternalIds.externalSystemId,
        playerExternalIds.externalId,
        data.externalIds,
      );

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

    await insertMissingExternalIds(
      this.db,
      playerExternalIds,
      existingRows,
      data.externalIds,
      (pair) => ({ playerId: player.id, ...pair }),
    );

    return { player, created };
  }

  countMvpAwardsByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'acting', types: MVP_AWARD_TYPES },
      eraId,
      competitionId,
    );
  }

  countTouchdownsScoredByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'acting', types: TOUCHDOWN_TYPES },
      eraId,
      competitionId,
    );
  }

  countCompletionsByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'acting', types: COMPLETION_TYPES },
      eraId,
      competitionId,
    );
  }

  countInterceptionsByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'acting', types: INTERCEPTION_TYPES },
      eraId,
      competitionId,
    );
  }

  countDeflectionsByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'acting', types: DEFLECTION_TYPES },
      eraId,
      competitionId,
    );
  }

  countCasualtiesCausedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'acting', types: CASUALTY_CAUSED_TYPES },
      eraId,
      competitionId,
    );
  }

  countSeriousInjuriesCausedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'acting', types: SERIOUS_INJURY_CAUSED_TYPES },
      eraId,
      competitionId,
    );
  }

  countDeathsCausedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'acting', types: DEATH_CAUSED_TYPES },
      eraId,
      competitionId,
    );
  }

  countFoulsCommittedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'acting', types: FOUL_TYPES },
      eraId,
      competitionId,
    );
  }

  countTimesSentOffByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'consequence', types: SENT_OFF_TYPES },
      eraId,
      competitionId,
    );
  }

  countCasualtiesSufferedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'consequence', types: CASUALTY_SUFFERED_TYPES },
      eraId,
      competitionId,
    );
  }

  countSeriousInjuriesSufferedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'consequence', types: SERIOUS_INJURY_SUFFERED_TYPES },
      eraId,
      competitionId,
    );
  }

  countLastingInjuriesSufferedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer(
      this.db,
      { role: 'consequence', types: LASTING_INJURY_SUFFERED_TYPES },
      eraId,
      competitionId,
    );
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

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count(players.id) })
      .from(players)
      .innerJoin(
        competitionTeams,
        eq(competitionTeams.teamEraId, players.teamEraId),
      )
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}

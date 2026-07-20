import type { UpsertPlayer } from '@blood-bowl-tracker/api-contract';
import type { Db, Player } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  playerExternalIds,
  players,
  positions,
  races,
  teamEras,
  teams,
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
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class PlayerUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class PlayersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findById(id: number): Promise<
    | {
        id: number;
        name: string;
        teamName: string;
        raceName: string;
        positionName: string;
      }
    | undefined
  > {
    const rows = await this.db
      .select({
        id: players.id,
        name: players.name,
        teamName: teams.name,
        raceName: races.name,
        positionName: positions.name,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(eq(players.id, id));
    return rows[0];
  }

  async upsert(
    data: UpsertPlayer,
  ): Promise<{ player: Player; created: boolean }> {
    const columns = {
      name: data.name,
      teamEraId: data.teamEraId,
      positionId: data.positionId,
    };

    const { row: player, created } = await upsertByExternalIds<
      typeof players,
      typeof playerExternalIds
    >({
      db: this.db,
      entityTable: players,
      entityIdColumn: players.id,
      values: columns,
      externalIdTable: playerExternalIds,
      ownerIdColumn: playerExternalIds.playerId,
      externalSystemIdColumn: playerExternalIds.externalSystemId,
      externalIdColumn: playerExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: PlayerUpsertConflictError,
      entityLabelPlural: 'players',
      buildExternalIdRow: (playerId, pair) => ({ playerId, ...pair }),
    });

    return { player, created };
  }

  countMvpAwardsByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: MVP_AWARD_TYPES },
      eraId,
      competitionId,
    });
  }

  countTouchdownsScoredByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: TOUCHDOWN_TYPES },
      eraId,
      competitionId,
    });
  }

  countCompletionsByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: COMPLETION_TYPES },
      eraId,
      competitionId,
    });
  }

  countInterceptionsByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: INTERCEPTION_TYPES },
      eraId,
      competitionId,
    });
  }

  countDeflectionsByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: DEFLECTION_TYPES },
      eraId,
      competitionId,
    });
  }

  countCasualtiesCausedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: CASUALTY_CAUSED_TYPES },
      eraId,
      competitionId,
    });
  }

  countSeriousInjuriesCausedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: SERIOUS_INJURY_CAUSED_TYPES },
      eraId,
      competitionId,
    });
  }

  countDeathsCausedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: DEATH_CAUSED_TYPES },
      eraId,
      competitionId,
    });
  }

  countFoulsCommittedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'acting', types: FOUL_TYPES },
      eraId,
      competitionId,
    });
  }

  countTimesSentOffByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'consequence', types: SENT_OFF_TYPES },
      eraId,
      competitionId,
    });
  }

  countCasualtiesSufferedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'consequence', types: CASUALTY_SUFFERED_TYPES },
      eraId,
      competitionId,
    });
  }

  countSeriousInjuriesSufferedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'consequence', types: SERIOUS_INJURY_SUFFERED_TYPES },
      eraId,
      competitionId,
    });
  }

  countLastingInjuriesSufferedByPlayer(
    eraId?: number,
    competitionId?: number,
  ): Promise<{ playerId: number; name: string; count: number }[]> {
    return countMatchEventsByPlayer({
      db: this.db,
      selector: { role: 'consequence', types: LASTING_INJURY_SUFFERED_TYPES },
      eraId,
      competitionId,
    });
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

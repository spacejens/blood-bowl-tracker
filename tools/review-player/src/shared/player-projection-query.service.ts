import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eras,
  playerExternalIds,
  players,
  positions,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

/**
 * The six-column player projection (`playerId`, `externalId`, `playerName`,
 * `teamName`, `positionName`, `eraName`) joined across `players`,
 * `playerExternalIds`, `teamEras`, `teams`, `eras` and `positions` — shared
 * by every query that needs "what a source's external id resolves to in the
 * database": `PlayerLookupService`'s override lookup and
 * `RandomPlayerStratificationService`'s random sample both build on this
 * same base, applying their own `.where()` / `.orderBy()` / `.limit()`.
 */
@Injectable()
export class PlayerProjectionQueryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  base(externalSystemId: number) {
    return this.db
      .select({
        playerId: players.id,
        externalId: playerExternalIds.externalId,
        playerName: players.name,
        teamName: teams.name,
        positionName: positions.name,
        eraName: eras.name,
      })
      .from(players)
      .innerJoin(
        playerExternalIds,
        and(
          eq(playerExternalIds.playerId, players.id),
          eq(playerExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(positions, eq(positions.id, players.positionId));
  }
}

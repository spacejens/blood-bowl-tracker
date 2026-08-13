import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eras,
  externalSystems,
  playerExternalIds,
  players,
  positions,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import type { TableCell } from '../shared/html.service';
import { HtmlService } from '../shared/html.service';
import type { SampledPlayer } from '../shared/review.types';

/**
 * Renders what the importers actually stored about a player: identity, the
 * team era they belong to, their position, and every external id they carry.
 * SPP totals are deliberately absent — they are the spp-totals data type's
 * panel pair, shown directly under this one.
 */
@Injectable()
export class PlayerInfoDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const rows = await this.db
      .select({
        playerId: players.id,
        playerName: players.name,
        teamName: teams.name,
        positionName: positions.name,
        isStarPlayer: positions.isStarPlayer,
        eraName: eras.name,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(eq(players.id, player.playerId));

    const stored = rows[0];
    if (stored === undefined) {
      return this.html.note(
        `No player row with id ${player.playerId} in the database.`,
      );
    }

    const externalIds = await this.externalIds(player.playerId);
    return this.html.table(
      ['Field', 'Value'],
      [
        ['Database id', String(stored.playerId)],
        ['Name', stored.playerName],
        ['Team', stored.teamName],
        ['Position', stored.positionName],
        ['Star player position', stored.isStarPlayer ? 'yes' : 'no'],
        ['Era', stored.eraName],
        ...externalIds,
      ],
    );
  }

  private async externalIds(playerId: number): Promise<TableCell[][]> {
    const rows = await this.db
      .select({
        systemName: externalSystems.name,
        externalId: playerExternalIds.externalId,
      })
      .from(playerExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, playerExternalIds.externalSystemId),
      )
      .where(eq(playerExternalIds.playerId, playerId))
      .orderBy(asc(externalSystems.name), asc(playerExternalIds.externalId));
    return rows.map((row) => [
      `External id (${row.systemName})`,
      row.externalId,
    ]);
  }
}

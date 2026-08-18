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
import type { TableCell } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ne } from 'drizzle-orm';

import type { SampledPlayer } from '../shared/review.types';

/**
 * Renders what the importers actually stored about a player: identity, the
 * team era they belong to, their position, every other team era that hired
 * the same star player, and every external id they carry. SPP totals are
 * deliberately absent — they are the spp-totals data type's panel pair, shown
 * directly under this one.
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
        positionId: players.positionId,
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
    const otherHires = stored.isStarPlayer
      ? await this.otherHires(stored.positionId, player.playerId)
      : [];
    return this.html.table(
      ['Field', 'Value'],
      [
        ['Database id', String(stored.playerId)],
        ['Name', stored.playerName],
        ['Team', stored.teamName],
        ['Position', stored.positionName],
        ['Star player position', stored.isStarPlayer ? 'yes' : 'no'],
        ['Era', stored.eraName],
        ...otherHires,
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

  /**
   * Every OTHER team-era hire of the same star player. A star's identity is
   * its position (#245): each hire is its own `players` row, so a star's full
   * history is every row sharing this `position_id`. Only queried for a star
   * position — a regular player belongs to exactly one team era for their
   * whole career, so the result would always be empty.
   */
  private async otherHires(
    positionId: number,
    playerId: number,
  ): Promise<TableCell[][]> {
    const rows = await this.db
      .select({ teamName: teams.name, eraName: eras.name })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(and(eq(players.positionId, positionId), ne(players.id, playerId)))
      .orderBy(asc(teams.name), asc(eras.name));
    if (rows.length === 0) {
      return [['Other hires', 'none']];
    }
    return rows.map((row) => [
      'Other hire',
      `${row.teamName} (${row.eraName})`,
    ]);
  }
}

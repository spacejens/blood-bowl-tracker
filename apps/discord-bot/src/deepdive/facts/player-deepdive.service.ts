import { PlayersService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type Player = {
  id: number;
  name: string;
  teamName: string;
  teamId: number;
  raceName: string;
  raceId: number;
  positionName: string;
  eraName: string;
  eraId: number;
  sppTotal: number | null;
  sppAdjustment: number | null;
};
type CategoryCount = { label: string; count: number };

/**
 * Composes the player header (team, era, race, position) and per-category event
 * counts into a single embed. Shared by `/deepdive player:<id>` and the player
 * deepdive buttons. Each DB call is wrapped in `databaseTimeout.run` with a
 * `null` sentinel so a timeout is distinguishable from a genuine "not found"
 * (`undefined`). Only non-zero categories are listed; an all-zero player shows
 * a short placeholder instead of an empty list. Team, era and race each get a
 * drill-down button, in the same order as the header lines; position has no
 * deepdive target, so it gets none.
 * When the player has a computed `sppTotal`, a trailing section shows any
 * manual adjustment and the total.
 */
@Injectable()
export class PlayerDeepdiveService {
  constructor(
    private readonly players: PlayersService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
  ) {}

  async resolve(playerId: number): Promise<string | InteractionReplyOptions> {
    const player: Player | undefined | null = await this.databaseTimeout.run(
      this.players.findById(playerId),
      null,
    );
    if (player === null) {
      return DEEPDIVE_PLAYER_TIMEOUT_MESSAGE;
    }
    if (player === undefined) {
      return DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE;
    }

    const header = [
      `Team: ${player.teamName}`,
      `Era: ${player.eraName}`,
      `Race: ${player.raceName}`,
      `Position: ${player.positionName}`,
    ];

    const counts: CategoryCount[] | null = await this.databaseTimeout.run(
      this.players.getDeepdiveCategoryCounts(playerId),
      null,
    );
    if (counts === null) {
      return DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE;
    }

    const nonZero = counts.filter((category) => category.count > 0);
    const categoryLines =
      nonZero.length === 0
        ? [DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE]
        : nonZero.map((category) => `${category.label}: ${category.count}`);

    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents([
        {
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.teamId),
          label: player.teamName,
        },
        {
          customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.eraId),
          label: player.eraName,
        },
        {
          customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(player.raceId),
          label: player.raceName,
        },
      ]);

    const description = [
      ...header,
      '',
      ...categoryLines,
      ...this.buildTotalLines(player),
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return { embeds: [{ title: player.name, description }], components };
  }

  /**
   * The trailing total section: nothing at all when no total has been computed
   * (null), otherwise a blank separator line, an optional adjustment line, and
   * the total. A computed total of 0 is shown — unlike a zero category count,
   * it is a real value rather than an absence. `sppTotal` already includes
   * `sppAdjustment`, so the adjustment line calls that out explicitly rather
   * than leaving a reader to assume the two lines should be summed.
   * `sppAdjustment` is clamped non-negative wherever it's written today
   * (`SppAdjustmentsService`), so the negative-sign branch below is
   * defensive against a future or manually-edited negative value.
   */
  private buildTotalLines(player: Player): string[] {
    if (player.sppTotal === null) {
      return [];
    }
    const adjustment = player.sppAdjustment;
    const adjustmentLines =
      adjustment === null || adjustment === 0
        ? []
        : [
            `Star player points adjustment: ${
              adjustment > 0 ? `+${adjustment}` : String(adjustment)
            } (included)`,
          ];
    return [
      '',
      ...adjustmentLines,
      `Total star player points: ${player.sppTotal}`,
    ];
  }
}

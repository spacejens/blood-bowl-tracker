import type { StarPlayerIdentity } from '@blood-bowl-tracker/game-data';
import { StarPlayersService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { EntityComponentsService } from '../../entity-components.service';
import {
  STAR_PLAYERS_LIST_NO_DATA_MESSAGE,
  STAR_PLAYERS_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';

@Injectable()
export class StarPlayersListService {
  constructor(
    private readonly starPlayers: StarPlayersService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
  ) {}

  /**
   * Unlike `ErasListService.resolve(scope)` this takes no `FactScope`: star
   * positions carry no league/era/competition FK, so the catalog is always
   * global. Mirrors `CoachToplistService.resolveErasActive()`, the existing
   * unscoped precedent.
   */
  async resolve(): Promise<string | InteractionReplyOptions> {
    const rows = await this.databaseTimeout.run(
      this.starPlayers.listAll(),
      null,
    );
    if (rows === null) {
      return STAR_PLAYERS_LIST_TIMEOUT_MESSAGE;
    }
    if (rows.length === 0) {
      return {
        embeds: [
          {
            title: 'Star Players',
            description: STAR_PLAYERS_LIST_NO_DATA_MESSAGE,
          },
        ],
      };
    }

    // `listAll()` already orders by name, but the re-sort keeps this layer's
    // display order independent of the query's, exactly like ErasListService
    // and TrophiesListService do.
    const ordered: StarPlayerIdentity[] = rows
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));

    const lines = ordered.map((star) => star.name);

    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(
        ordered.map((star) => ({
          customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(star.positionId),
          label: star.name,
        })),
      );
    if (overflowNote !== null) {
      lines.push(overflowNote);
    }

    return {
      embeds: [{ title: 'Star Players', description: lines.join('\n') }],
      components,
    };
  }
}

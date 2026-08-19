import type { StarPlayerIdentity } from '@blood-bowl-tracker/game-data';
import { StarPlayersService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
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
   * positions do have a schema path to a league (via `positions_race_eras`),
   * but the "star player exception" links every star as available in
   * essentially every era, so that path would not meaningfully narrow a
   * league/era-scoped query — see `StarPlayersService.listAll`'s doc comment.
   * Mirrors `CoachToplistService.resolveErasActive()`, the existing unscoped
   * precedent.
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
      embeds: [
        {
          title: 'Star Players',
          description: this.enforceDescriptionLimit(lines.join('\n')),
        },
      ],
      components,
    };
  }

  /**
   * Truncates the embed description to Discord's `MAX_DESCRIPTION_LENGTH`
   * (a hard per-field cap; exceeding it rejects the whole interaction, not
   * just this field). Unlike the sibling list facts, starPlayers.list can
   * never be narrowed by a league scope, so it is the one most exposed to
   * this limit as the star catalog grows. Mirrors
   * `StarPlayerDeepdiveService.enforceDescriptionLimit`.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }
}

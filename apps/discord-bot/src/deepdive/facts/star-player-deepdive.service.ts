import type {
  StarPlayerHire,
  StarPlayerIdentity,
} from '@blood-bowl-tracker/game-data';
import { StarPlayersService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_STAR_PLAYER_HIRES_TIMEOUT_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_STAR_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

/**
 * Composes a star player's hire history into a single embed: one line per
 * team that has ever hired the star, most hires first, each with a drill-down
 * button to that team. Shared by `/deepdive star-player:<positionId>`, the
 * star-player buttons, and the cross-link button on the regular player
 * deepdive.
 *
 * The subject here is a `positions` row, not a `players` row — a star's
 * identity is its position, and every hire is its own players row (issue
 * #245). That is exactly why this target exists: the regular player deepdive
 * can only ever show the single hire it was opened on.
 *
 * Each DB call is wrapped in `databaseTimeout.run` with a `null` sentinel so
 * a timeout is distinguishable from a genuine "not found" (`undefined`). A
 * star that resolves but has no hires is reported as not found rather than as
 * an empty list: a star nobody has ever hired has no history to show, and the
 * embed would otherwise be an empty box.
 *
 * Hires are summed per team, never split per era — a deliberate product
 * decision, since a team re-hiring the same star season after season (and TP
 * minting a fresh hire row per match inducement) makes the per-era split
 * noise rather than information.
 */
@Injectable()
export class StarPlayerDeepdiveService {
  constructor(
    private readonly stars: StarPlayersService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly entityComponents: EntityComponentsService,
  ) {}

  async resolve(positionId: number): Promise<string | InteractionReplyOptions> {
    const star: StarPlayerIdentity | undefined | null =
      await this.databaseTimeout.run(this.stars.findById(positionId), null);
    if (star === null) {
      return DEEPDIVE_STAR_PLAYER_TIMEOUT_MESSAGE;
    }
    if (star === undefined) {
      return DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE;
    }

    const hires: StarPlayerHire[] | null = await this.databaseTimeout.run(
      this.stars.listHiresByTeam(positionId),
      null,
    );
    if (hires === null) {
      return DEEPDIVE_STAR_PLAYER_HIRES_TIMEOUT_MESSAGE;
    }
    if (hires.length === 0) {
      return DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE;
    }

    // The game-data query already orders by hire count descending (ties broken
    // by team name), so both the description and the buttons take the rows as
    // they arrive — the two can never disagree about the order.
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(
        hires.map((hire) => ({
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(hire.teamId),
          label: hire.teamName,
        })),
      );

    const description = [
      ...hires.map((hire) => this.formatHire(hire)),
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [
        {
          title: `${this.entityComponents.getEmojiForPrefix(STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX)} ${star.name}`,
          description,
        },
      ],
      ...(components.length > 0 ? { components } : {}),
    };
  }

  /** `Reikland Reavers (Human, coached by Rita) — 3 hires`. */
  private formatHire(hire: StarPlayerHire): string {
    const plural = hire.hireCount === 1 ? 'hire' : 'hires';
    return `${hire.teamName} (${hire.raceName}, coached by ${hire.coachName}) — ${hire.hireCount} ${plural}`;
  }
}

import type {
  PositionCharacteristics,
  StarPlayerHire,
  StarPlayerIdentity,
} from '@blood-bowl-tracker/game-data';
import {
  PositionRulesSetsService,
  StarPlayersService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_STAR_PLAYER_CHARACTERISTICS_TIMEOUT_MESSAGE,
  DEEPDIVE_STAR_PLAYER_HIRES_TIMEOUT_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NO_CHARACTERISTICS_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_STAR_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PositionCharacteristicsLineFormatterService } from './position-characteristics-line-formatter.service';

/**
 * Composes a star player's hire history into a single embed: one line per
 * team that has ever hired the star, most hires first, each with a drill-down
 * button to that team. Shared by `/deepdive star-player:<positionId>`, the
 * star-player buttons, and the cross-link button on the regular player
 * deepdive.
 *
 * The subject here is a `positions` row, not a `players` row — a star's
 * identity is its position, and every hire is its own players row. That is
 * exactly why this target exists: the regular player deepdive can only ever
 * show the single hire it was opened on.
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
 *
 * Because a star *is* a position, its per-rules-set characteristics come
 * from the same `position_rules_sets` rows any other position uses, and are
 * rendered through the same shared
 * `PositionCharacteristicsLineFormatterService` as the position deepdive —
 * so the two views can never disagree about a star's numbers. There is no
 * up/down marker against a baseline the way the regular player deepdive has
 * one: a star has no single current era to compare against, so the full
 * per-rules-set list is shown instead.
 */
@Injectable()
export class StarPlayerDeepdiveService {
  constructor(
    private readonly stars: StarPlayersService,
    private readonly positionRulesSets: PositionRulesSetsService,
    private readonly lineFormatter: PositionCharacteristicsLineFormatterService,
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

    const rulesSetRows: PositionCharacteristics[] | null =
      await this.databaseTimeout.run(
        this.positionRulesSets.listByPosition(positionId),
        null,
      );
    if (rulesSetRows === null) {
      return DEEPDIVE_STAR_PLAYER_CHARACTERISTICS_TIMEOUT_MESSAGE;
    }

    const statLines =
      rulesSetRows.length === 0
        ? [DEEPDIVE_STAR_PLAYER_NO_CHARACTERISTICS_MESSAGE]
        : rulesSetRows.map((row) => this.lineFormatter.formatLine(row));

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
      ...statLines,
      '',
      ...hires.map((hire) => this.formatHire(hire)),
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [
        {
          title: `${this.entityComponents.getEmojiForPrefix(STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX)} ${star.name}`,
          description: this.enforceDescriptionLimit(description),
        },
      ],
      ...(components.length > 0 ? { components } : {}),
    };
  }

  /** `Reikland Reavers (Human, Rita) — 3 hires`. */
  private formatHire(hire: StarPlayerHire): string {
    const plural = hire.hireCount === 1 ? 'hire' : 'hires';
    return `${hire.teamName} (${hire.raceName}, ${hire.coachName}) — ${hire.hireCount} ${plural}`;
  }

  /**
   * Absolute safety net for Discord's embed description limit.
   * `listHiresByTeam` carries no row limit, so a star hired by enough teams
   * — exactly the scenario the select-menu button overflow in
   * `EntityComponentsService` exists for — can produce a description longer
   * than `MAX_DESCRIPTION_LENGTH`, which would cause Discord to reject the
   * whole interaction. Mirrors `PlayerDeepdiveService.enforceDescriptionLimit`
   * verbatim in shape.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }
}

import type {
  PositionCharacteristics,
  PositionHeader,
  PositionTopPlayer,
} from '@blood-bowl-tracker/game-data';
import {
  CharacteristicDisplayFormattingService,
  PositionRulesSetsService,
  PositionsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import type { EntityComponentEntry } from '../../entity-components.service';
import { EntityComponentsService } from '../../entity-components.service';
import {
  DEEPDIVE_POSITION_CHARACTERISTICS_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_NO_CHARACTERISTICS_MESSAGE,
  DEEPDIVE_POSITION_NO_PLAYERS_MESSAGE,
  DEEPDIVE_POSITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_POSITION_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_PLAYER_COUNT_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_TOP_PLAYERS_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  LeaderboardService,
  MAX_LEADERBOARD_ENTRIES,
} from '../../insights/leaderboard.service';
import { PlayerContextService } from '../../insights/player-context.service';
import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  POSITION_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

/** Position at which the top-players list opens a tie group (5th place). */
const TOP_PLAYERS_TOP_ENTRIES = 5;

/**
 * Composes a position's header, its stat line under every rules set it has
 * recorded characteristics for, how many players have held it, and its top
 * players by career SPP, into a single embed. Shared by
 * `/deepdive position:<id>` and the position drill-down buttons.
 *
 * Each stat line is rendered with *that rules set's own* declared formats
 * rather than a single uniform style: how a position's characteristics
 * changed between rules sets is the reason this view exists, so flattening
 * them would hide exactly what it is for. A rules set whose Passing
 * characteristic is `absent` omits the field entirely rather than printing a
 * placeholder — the characteristic does not exist there, which is different
 * from existing and being unknown.
 *
 * Each DB call is wrapped in `databaseTimeout.run` with a `null` sentinel so
 * a timeout stays distinguishable from a genuine "not found" (`undefined`).
 */
@Injectable()
export class PositionDeepdiveService {
  constructor(
    private readonly positions: PositionsService,
    private readonly positionRulesSets: PositionRulesSetsService,
    private readonly characteristics: CharacteristicDisplayFormattingService,
    private readonly databaseTimeout: DatabaseTimeoutService,
    private readonly leaderboard: LeaderboardService,
    private readonly entityComponents: EntityComponentsService,
    private readonly playerContext: PlayerContextService,
  ) {}

  async resolve(positionId: number): Promise<string | InteractionReplyOptions> {
    const position: PositionHeader | undefined | null =
      await this.databaseTimeout.run(this.positions.findById(positionId), null);
    if (position === null) {
      return DEEPDIVE_POSITION_TIMEOUT_MESSAGE;
    }
    if (position === undefined) {
      return DEEPDIVE_POSITION_NOT_FOUND_MESSAGE;
    }

    const rulesSetRows: PositionCharacteristics[] | null =
      await this.databaseTimeout.run(
        this.positionRulesSets.listByPosition(positionId),
        null,
      );
    if (rulesSetRows === null) {
      return DEEPDIVE_POSITION_CHARACTERISTICS_TIMEOUT_MESSAGE;
    }

    const playerCount: number | null = await this.databaseTimeout.run(
      this.positions.countPlayers(positionId),
      null,
    );
    if (playerCount === null) {
      return DEEPDIVE_POSITION_PLAYER_COUNT_TIMEOUT_MESSAGE;
    }

    const topPlayers: PositionTopPlayer[] | null =
      await this.databaseTimeout.run(
        this.positions.listTopPlayersBySpp(positionId, MAX_LEADERBOARD_ENTRIES),
        null,
      );
    if (topPlayers === null) {
      return DEEPDIVE_POSITION_TOP_PLAYERS_TIMEOUT_MESSAGE;
    }

    const raceNames =
      position.races.length > 0
        ? position.races.map((race) => race.name).join(', ')
        : 'None recorded';

    const statLines =
      rulesSetRows.length === 0
        ? [DEEPDIVE_POSITION_NO_CHARACTERISTICS_MESSAGE]
        : rulesSetRows.map((row) => this.formatStatLine(row));

    // `topRanksWithTies` ranks by a `count` field, so SPP is surfaced under
    // that name for ranking only; the rendered line still reads as SPP.
    const { rows: ranked, truncatedCount } = this.leaderboard.topRanksWithTies(
      topPlayers.map((player) => ({ ...player, count: player.sppTotal })),
      TOP_PLAYERS_TOP_ENTRIES,
    );
    // Every listed player already holds this position, so repeating it would
    // say nothing new, and a position is not scoped to one race or one era
    // the way this decoration's other options assume — only team and coach
    // add information here. Wrapped in the same timeout handling as every
    // other DB call in this method, since attachSuffixes does its own DB
    // round trip — skipped entirely when there is nothing to decorate, so a
    // position with no players never risks the player-context timeout
    // message in place of the correct "no players" view.
    const decorated:
      | (PositionTopPlayer & {
          count: number;
          rank: number;
          contextSuffix: string;
        })[]
      | null =
      ranked.length === 0
        ? []
        : await this.databaseTimeout.run(
            this.playerContext.attachSuffixes(ranked, (row) => row.id, {
              includePosition: false,
              includeTeam: true,
              includeRace: false,
              includeEra: false,
              includeCoach: true,
            }),
            null,
          );
    if (decorated === null) {
      return DEEPDIVE_POSITION_PLAYER_CONTEXT_TIMEOUT_MESSAGE;
    }
    const playerLines =
      decorated.length === 0
        ? [DEEPDIVE_POSITION_NO_PLAYERS_MESSAGE]
        : decorated.map(
            (row) =>
              `${row.rank}. ${row.name}${row.contextSuffix} — ${row.sppTotal}`,
          );
    if (truncatedCount > 0) {
      playerLines.push(`…and ${truncatedCount} more tied.`);
    }

    // Races first, then the top players: `buildEntityComponents` has no
    // internal prioritisation (first-N wins), and a position's races are the
    // context a reader needs before any individual who held it.
    const entries: EntityComponentEntry[] = [
      ...position.races.map((race): EntityComponentEntry => ({
        customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(race.id),
        label: race.name,
      })),
      ...ranked.map((player): EntityComponentEntry => ({
        customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
        entityId: String(player.id),
        label: player.name,
      })),
    ];
    const { components, overflowNote } =
      this.entityComponents.buildEntityComponents(entries);

    const description = [
      `Race(s): ${raceNames}`,
      '',
      ...statLines,
      '',
      `Held by ${playerCount} ${playerCount === 1 ? 'player' : 'players'}`,
      '',
      'Top players by SPP:',
      ...playerLines,
      ...(overflowNote === null ? [] : [overflowNote]),
    ].join('\n');

    return {
      embeds: [
        {
          title: `${this.entityComponents.getEmojiForPrefix(POSITION_BUTTON_CUSTOM_ID_PREFIX)} ${position.name}`,
          description: this.enforceDescriptionLimit(description),
        },
      ],
      ...(components.length > 0 ? { components } : {}),
    };
  }

  /**
   * Absolute safety net for Discord's embed description limit. Race and
   * player names, and how many rules sets a position spans, are all
   * unbounded in practice, so this measures the actual assembled string
   * rather than trusting any of this method's inputs to stay small — the
   * same last-resort truncation `PlayerDeepdiveService` and
   * `StarPlayerDeepdiveService` apply to their own descriptions.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
  }

  /** `BB2020: MA 7 ST 3 AG 3+ PA 4+ AV 9+`. */
  private formatStatLine(row: PositionCharacteristics): string {
    const fields = [
      `MA ${this.characteristics.format(row.move, row.moveFormat)}`,
      `ST ${this.characteristics.format(row.strength, row.strengthFormat)}`,
      `AG ${this.characteristics.format(row.agility, row.agilityFormat)}`,
      // A rules set without a Passing characteristic drops the field rather
      // than showing a placeholder: it does not exist there at all.
      ...(row.passingFormat === 'absent'
        ? []
        : [
            `PA ${this.characteristics.format(row.passing, row.passingFormat)}`,
          ]),
      `AV ${this.characteristics.format(row.armour, row.armourFormat)}`,
    ];
    return `${row.rulesSetName}: ${fields.join(' ')}`;
  }
}

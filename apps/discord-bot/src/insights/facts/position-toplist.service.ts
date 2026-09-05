import type {
  FactScope,
  PositionPlayerCount,
} from '@blood-bowl-tracker/game-data';
import { PositionsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { POSITION_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  POSITION_TOPLIST_NO_DATA_MESSAGE,
  POSITION_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { EntityLink } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';

/**
 * The `position.toplist.*` facts. Hand-written like RaceToplistService rather
 * than assembled through ToplistFactoryService: there is one metric here, so
 * the multi-resolver factory would add indirection without removing any
 * repetition.
 */
@Injectable()
export class PositionToplistService {
  private readonly positionLink: EntityLink<PositionPlayerCount> = {
    customIdPrefix: POSITION_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: PositionPlayerCount) => row.positionId,
    // Position names repeat across races (every race has a "Lineman"), so the
    // button/select label carries the race too, matching formatRow below.
    label: (row: PositionPlayerCount) => `${row.name} (${row.raceName})`,
  };

  constructor(
    private readonly positions: PositionsService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  /**
   * Positions ranked by how many players have held them. Rows carry the
   * position's race because position names repeat across races — every race
   * has a "Lineman" — so the name alone would not say which one a row means.
   */
  resolvePlayers(scope: FactScope): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<PositionPlayerCount>({
      title: 'Positions by players',
      fetchRows: (limit) => this.positions.countPlayersByPosition(scope, limit),
      timeoutMessage: POSITION_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: POSITION_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.positionLink,
      formatRow: (row) =>
        `${row.rank}. ${row.name} (${row.raceName}) — ${row.count}`,
    });
  }
}

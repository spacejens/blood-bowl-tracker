import type {
  StarPlayerDistinctTeamsHiredCount,
  StarPlayerHireCount,
} from '@blood-bowl-tracker/game-data';
import { StarPlayersService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';
import type { InteractionReplyOptions } from 'discord.js';

import { STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_NO_DATA_MESSAGE,
  STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_TIMEOUT_MESSAGE,
  STAR_PLAYER_TOPLIST_NO_DATA_MESSAGE,
  STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { EntityLink } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';

/**
 * The star player toplist facts. Hand-written rather than produced by
 * `makeToplistResolvers`: that factory is built around count methods taking a
 * `FactScope`, and star player facts have no scope to give it (a star position
 * reaches a league only through the "star player exception", which links every
 * star to essentially every era — see `StarPlayersService`'s doc comment).
 * `StarPlayersListService` and `TeamToplistService.resolveErasActive()` are the
 * existing precedents for the same reason.
 */
@Injectable()
export class StarPlayerToplistService {
  private readonly starPlayerLink: EntityLink<{ positionId: number }> = {
    customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: { positionId: number }) => row.positionId,
  };

  constructor(
    private readonly starPlayers: StarPlayersService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  /**
   * Stars ranked by how many times they have been hired in total, across every
   * team and era. No `formatRow`: a star row carries no team/race/coach context
   * to append, so the leaderboard's default `rank. name — count` line is right
   * as-is.
   */
  resolveTotalHires(): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<StarPlayerHireCount>({
      title: 'Star players by times hired',
      fetchRows: (limit) => this.starPlayers.countTotalHires(limit),
      timeoutMessage: STAR_PLAYER_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: STAR_PLAYER_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.starPlayerLink,
    });
  }

  /**
   * Stars ranked by how many distinct teams have ever hired them, across
   * every era. No `formatRow`, same reasoning as `resolveTotalHires`.
   */
  resolveDistinctTeamsHired(): Promise<string | InteractionReplyOptions> {
    return this.leaderboard.resolveToplist<StarPlayerDistinctTeamsHiredCount>({
      title: 'Star players by distinct teams hired',
      fetchRows: (limit) => this.starPlayers.countDistinctTeamsHired(limit),
      timeoutMessage: STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: STAR_PLAYER_DISTINCT_TEAMS_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.starPlayerLink,
    });
  }
}

import type { FactScope, PlayersService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  PLAYER_TOPLIST_NO_DATA_MESSAGE,
  PLAYER_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../leaderboard.service';
import type { ScopedCountMethods, ToplistResolver } from './toplist-factory';
import { makeToplistResolvers } from './toplist-factory';

type PlayerToplistMethod = ScopedCountMethods<PlayersService>;

/**
 * Every player toplist is the same resolver over a different count: the table
 * below (count method -> embed title) is the whole of what varies.
 */
@Injectable()
export class PlayerToplistService {
  private readonly resolvers: Record<
    PlayerToplistMethod,
    ToplistResolver<PlayersService>
  >;

  constructor(
    private readonly players: PlayersService,
    private readonly leaderboard: LeaderboardService,
  ) {
    this.resolvers = makeToplistResolvers<
      PlayerToplistMethod,
      PlayersService,
      { playerId: number; name: string; count: number }
    >({
      titles: {
        countMvpAwardsByPlayer: 'Players by MVP awards',
        countTouchdownsScoredByPlayer: 'Players by touchdowns scored',
        countCompletionsByPlayer: 'Players by completions',
        countInterceptionsByPlayer: 'Players by interceptions',
        countDeflectionsByPlayer: 'Players by deflections',
        countCasualtiesCausedByPlayer: 'Players by casualties inflicted',
        countSeriousInjuriesCausedByPlayer:
          'Players by serious injuries inflicted',
        countDeathsCausedByPlayer: 'Players by opponents killed',
        countFoulsCommittedByPlayer: 'Players by fouls committed',
        countTimesSentOffByPlayer: 'Players by times sent off',
        countCasualtiesSufferedByPlayer: 'Players by casualties suffered',
        countSeriousInjuriesSufferedByPlayer:
          'Players by serious injuries suffered',
        countLastingInjuriesSufferedByPlayer:
          'Players by lasting injuries suffered',
      },
      timeoutMessage: PLAYER_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: PLAYER_TOPLIST_NO_DATA_MESSAGE,
      buildCustomId: (row) => this.playerButtonId(row),
      leaderboard: this.leaderboard,
    });
  }

  private playerButtonId(row: { playerId: number }): string {
    return `${PLAYER_BUTTON_CUSTOM_ID_PREFIX}${row.playerId}`;
  }

  resolveMvps(scope: FactScope) {
    return this.resolvers.countMvpAwardsByPlayer(this.players, scope);
  }

  resolveTouchdownsScored(scope: FactScope) {
    return this.resolvers.countTouchdownsScoredByPlayer(this.players, scope);
  }

  resolveCompletions(scope: FactScope) {
    return this.resolvers.countCompletionsByPlayer(this.players, scope);
  }

  resolveInterceptions(scope: FactScope) {
    return this.resolvers.countInterceptionsByPlayer(this.players, scope);
  }

  resolveDeflections(scope: FactScope) {
    return this.resolvers.countDeflectionsByPlayer(this.players, scope);
  }

  resolveCasualtiesCaused(scope: FactScope) {
    return this.resolvers.countCasualtiesCausedByPlayer(this.players, scope);
  }

  resolveSeriousInjuriesCaused(scope: FactScope) {
    return this.resolvers.countSeriousInjuriesCausedByPlayer(
      this.players,
      scope,
    );
  }

  resolveDeathsCaused(scope: FactScope) {
    return this.resolvers.countDeathsCausedByPlayer(this.players, scope);
  }

  resolveFoulsCommitted(scope: FactScope) {
    return this.resolvers.countFoulsCommittedByPlayer(this.players, scope);
  }

  resolveTimesSentOff(scope: FactScope) {
    return this.resolvers.countTimesSentOffByPlayer(this.players, scope);
  }

  resolveCasualtiesSuffered(scope: FactScope) {
    return this.resolvers.countCasualtiesSufferedByPlayer(this.players, scope);
  }

  resolveSeriousInjuriesSuffered(scope: FactScope) {
    return this.resolvers.countSeriousInjuriesSufferedByPlayer(
      this.players,
      scope,
    );
  }

  resolveLastingInjuriesSuffered(scope: FactScope) {
    return this.resolvers.countLastingInjuriesSufferedByPlayer(
      this.players,
      scope,
    );
  }
}

import type { FactScope } from '@blood-bowl-tracker/game-data';
import { PlayersService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  PLAYER_TOPLIST_NO_DATA_MESSAGE,
  PLAYER_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { EntityLink } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';
import { PlayerContextService } from '../player-context.service';
import type { ScopedCountMethods, ToplistResolver } from './toplist-factory';
import { makeToplistResolvers } from './toplist-factory';

type PlayerToplistMethod = ScopedCountMethods<PlayersService>;

/**
 * The row shape every player toplist renders. `contextSuffix` is optional so the
 * undecorated rows a `PlayersService` count method returns are still assignable
 * here; `decoratePlayerRows` fills it in before the rows reach the embed.
 */
type PlayerToplistRow = {
  playerId: number;
  name: string;
  count: number;
  contextSuffix?: string;
};

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

  private readonly playerLink: EntityLink<{ playerId: number }> = {
    customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
    entityId: (row: { playerId: number }) => row.playerId,
  };

  constructor(
    private readonly players: PlayersService,
    private readonly leaderboard: LeaderboardService,
    private readonly playerContext: PlayerContextService,
  ) {
    this.resolvers = makeToplistResolvers<
      PlayerToplistMethod,
      PlayersService,
      PlayerToplistRow
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
        topPlayersByTotalSpp: 'Players by total SPP',
      },
      timeoutMessage: PLAYER_TOPLIST_TIMEOUT_MESSAGE,
      noDataMessage: PLAYER_TOPLIST_NO_DATA_MESSAGE,
      entityLink: this.playerLink,
      decorateRows: (rows, scope) => this.decoratePlayerRows(rows, scope),
      formatRow: (row) => this.formatPlayerRow(row),
      leaderboard: this.leaderboard,
    });
  }

  /**
   * No player toplist is scoped to a team, race or coach, so those always add
   * information. The era is the exception: an era-scoped toplist already names
   * the era in its headline, so repeating it on every row says nothing.
   */
  private decoratePlayerRows(
    rows: PlayerToplistRow[],
    scope: FactScope,
  ): Promise<PlayerToplistRow[]> {
    return this.playerContext.attachSuffixes(rows, (row) => row.playerId, {
      includePosition: true,
      includeTeam: true,
      includeRace: true,
      includeEra: scope.eraId === undefined,
      includeCoach: true,
    });
  }

  private formatPlayerRow(row: PlayerToplistRow & { rank: number }): string {
    return `${row.rank}. ${row.name}${row.contextSuffix ?? ''} — ${row.count}`;
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

  resolveTotalSpp(scope: FactScope) {
    return this.resolvers.topPlayersByTotalSpp(this.players, scope);
  }
}

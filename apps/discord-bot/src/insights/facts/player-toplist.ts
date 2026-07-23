import type { PlayersService } from '@blood-bowl-tracker/game-data';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  PLAYER_TOPLIST_NO_DATA_MESSAGE,
  PLAYER_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../slash-commands/deepdive-command.service';
import { LeaderboardService } from '../leaderboard.service';
import type { ScopedCountMethods } from './toplist-factory';
import { makeToplistResolvers } from './toplist-factory';

type PlayerToplistMethod = ScopedCountMethods<PlayersService>;

// Temporary module-scoped instance until this file is migrated onto NestJS DI
// (Task 5/6); makeToplistResolvers now requires a LeaderboardService.
const leaderboard = new LeaderboardService(new DatabaseTimeoutService());

function playerButtonId(row: { playerId: number }): string {
  return `${PLAYER_BUTTON_CUSTOM_ID_PREFIX}${row.playerId}`;
}

/**
 * Every player toplist is the same resolver over a different count: the table
 * below (count method -> embed title) is the whole of what varies.
 */
const resolvers = makeToplistResolvers<
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
    countSeriousInjuriesCausedByPlayer: 'Players by serious injuries inflicted',
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
  buildCustomId: playerButtonId,
  leaderboard,
});

export const resolvePlayerMvpsToplist = resolvers.countMvpAwardsByPlayer;
export const resolvePlayerTouchdownsScoredToplist =
  resolvers.countTouchdownsScoredByPlayer;
export const resolvePlayerCompletionsToplist =
  resolvers.countCompletionsByPlayer;
export const resolvePlayerInterceptionsToplist =
  resolvers.countInterceptionsByPlayer;
export const resolvePlayerDeflectionsToplist =
  resolvers.countDeflectionsByPlayer;
export const resolvePlayerCasualtiesCausedToplist =
  resolvers.countCasualtiesCausedByPlayer;
export const resolvePlayerSeriousInjuriesCausedToplist =
  resolvers.countSeriousInjuriesCausedByPlayer;
export const resolvePlayerDeathsCausedToplist =
  resolvers.countDeathsCausedByPlayer;
export const resolvePlayerFoulsCommittedToplist =
  resolvers.countFoulsCommittedByPlayer;
export const resolvePlayerTimesSentOffToplist =
  resolvers.countTimesSentOffByPlayer;
export const resolvePlayerCasualtiesSufferedToplist =
  resolvers.countCasualtiesSufferedByPlayer;
export const resolvePlayerSeriousInjuriesSufferedToplist =
  resolvers.countSeriousInjuriesSufferedByPlayer;
export const resolvePlayerLastingInjuriesSufferedToplist =
  resolvers.countLastingInjuriesSufferedByPlayer;

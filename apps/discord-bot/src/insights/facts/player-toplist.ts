import type { PlayersService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  PLAYER_TOPLIST_NO_DATA_MESSAGE,
  PLAYER_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { resolveToplist } from '../leaderboard';

export async function resolvePlayerMvpsToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by MVP awards',
    () => players.countMvpAwardsByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerTouchdownsScoredToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by touchdowns scored',
    () => players.countTouchdownsScoredByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerCompletionsToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by completions',
    () => players.countCompletionsByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerInterceptionsToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by interceptions',
    () => players.countInterceptionsByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerDeflectionsToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by deflections',
    () => players.countDeflectionsByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerCasualtiesCausedToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by casualties inflicted',
    () => players.countCasualtiesCausedByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerSeriousInjuriesCausedToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by serious injuries inflicted',
    () => players.countSeriousInjuriesCausedByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerDeathsCausedToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by opponents killed',
    () => players.countDeathsCausedByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerFoulsCommittedToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by fouls committed',
    () => players.countFoulsCommittedByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerTimesSentOffToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by times sent off',
    () => players.countTimesSentOffByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerCasualtiesSufferedToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by casualties suffered',
    () => players.countCasualtiesSufferedByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerSeriousInjuriesSufferedToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by serious injuries suffered',
    () => players.countSeriousInjuriesSufferedByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolvePlayerLastingInjuriesSufferedToplist(
  players: PlayersService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Players by lasting injuries suffered',
    () => players.countLastingInjuriesSufferedByPlayer(eraId, competitionId),
    PLAYER_TOPLIST_TIMEOUT_MESSAGE,
    PLAYER_TOPLIST_NO_DATA_MESSAGE,
  );
}

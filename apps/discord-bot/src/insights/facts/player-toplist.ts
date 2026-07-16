import type { PlayersService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { resolveToplist } from '../leaderboard';

export async function resolvePlayerMvpsToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by MVP awards', () =>
    players.countMvpAwardsByPlayer(eraId),
  );
}

export async function resolvePlayerTouchdownsScoredToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by touchdowns scored', () =>
    players.countTouchdownsScoredByPlayer(eraId),
  );
}

export async function resolvePlayerCompletionsToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by completions', () =>
    players.countCompletionsByPlayer(eraId),
  );
}

export async function resolvePlayerInterceptionsToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by interceptions', () =>
    players.countInterceptionsByPlayer(eraId),
  );
}

export async function resolvePlayerDeflectionsToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by deflections', () =>
    players.countDeflectionsByPlayer(eraId),
  );
}

export async function resolvePlayerCasualtiesCausedToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by casualties inflicted', () =>
    players.countCasualtiesCausedByPlayer(eraId),
  );
}

export async function resolvePlayerSeriousInjuriesCausedToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by serious injuries inflicted', () =>
    players.countSeriousInjuriesCausedByPlayer(eraId),
  );
}

export async function resolvePlayerDeathsCausedToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by opponents killed', () =>
    players.countDeathsCausedByPlayer(eraId),
  );
}

export async function resolvePlayerFoulsCommittedToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by fouls committed', () =>
    players.countFoulsCommittedByPlayer(eraId),
  );
}

export async function resolvePlayerTimesSentOffToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by times sent off', () =>
    players.countTimesSentOffByPlayer(eraId),
  );
}

export async function resolvePlayerCasualtiesSufferedToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by casualties suffered', () =>
    players.countCasualtiesSufferedByPlayer(eraId),
  );
}

export async function resolvePlayerSeriousInjuriesSufferedToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by serious injuries suffered', () =>
    players.countSeriousInjuriesSufferedByPlayer(eraId),
  );
}

export async function resolvePlayerLastingInjuriesSufferedToplist(
  players: PlayersService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Players by lasting injuries suffered', () =>
    players.countLastingInjuriesSufferedByPlayer(eraId),
  );
}

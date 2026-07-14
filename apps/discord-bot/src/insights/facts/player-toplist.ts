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

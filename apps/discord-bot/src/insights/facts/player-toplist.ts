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

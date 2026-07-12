import type { TeamsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { resolveToplist } from '../leaderboard';

export async function resolveTeamMatchesPlayedToplist(
  teams: TeamsService,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by matches played', () =>
    teams.countMatchesPlayedByTeam(),
  );
}

import type { TeamsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  DATABASE_TIMEOUT_FALLBACK_MESSAGE,
  withDatabaseTimeout,
} from '../../database-timeout';
import { formatLeaderboardEmbed, topRanksWithTies } from '../leaderboard';

export async function resolveTeamMatchesPlayedToplist(
  teams: TeamsService,
): Promise<string | InteractionReplyOptions> {
  const rows = await withDatabaseTimeout<
    { teamId: number; name: string; count: number }[] | null
  >(teams.countMatchesPlayedByTeam(), null);
  if (rows === null) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }
  return formatLeaderboardEmbed(
    'Teams by matches played',
    topRanksWithTies(rows, 5),
  );
}

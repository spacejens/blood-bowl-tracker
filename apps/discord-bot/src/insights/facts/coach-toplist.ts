import type { CoachesService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  DATABASE_TIMEOUT_FALLBACK_MESSAGE,
  withDatabaseTimeout,
} from '../../database-timeout';
import { formatLeaderboardEmbed, topRanksWithTies } from '../leaderboard';

export async function resolveCoachMatchesPlayedToplist(
  coaches: CoachesService,
): Promise<string | InteractionReplyOptions> {
  const rows = await withDatabaseTimeout<
    { coachId: number; name: string; count: number }[] | null
  >(coaches.countMatchesPlayedByCoach(), null);
  if (rows === null) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }
  return formatLeaderboardEmbed(
    'Coaches by matches played',
    topRanksWithTies(rows, 5),
  );
}

export async function resolveCoachTeamsToplist(
  coaches: CoachesService,
): Promise<string | InteractionReplyOptions> {
  const rows = await withDatabaseTimeout<
    { coachId: number; name: string; count: number }[] | null
  >(coaches.countTeamsByCoach(), null);
  if (rows === null) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }
  return formatLeaderboardEmbed(
    'Coaches by teams coached',
    topRanksWithTies(rows, 5),
  );
}

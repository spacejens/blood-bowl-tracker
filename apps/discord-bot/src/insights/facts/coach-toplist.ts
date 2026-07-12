import type { CoachesService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { resolveToplist } from '../leaderboard';

export async function resolveCoachMatchesPlayedToplist(
  coaches: CoachesService,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Coaches by matches played', () =>
    coaches.countMatchesPlayedByCoach(),
  );
}

export async function resolveCoachTeamsToplist(
  coaches: CoachesService,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Coaches by teams coached', () =>
    coaches.countTeamsByCoach(),
  );
}

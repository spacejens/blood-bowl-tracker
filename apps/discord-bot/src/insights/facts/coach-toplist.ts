import type { CoachesService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { resolveToplist } from '../leaderboard';

export async function resolveCoachMatchesPlayedToplist(
  coaches: CoachesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Coaches by matches played', () =>
    coaches.countMatchesPlayedByCoach(eraId),
  );
}

export async function resolveCoachTeamsToplist(
  coaches: CoachesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Coaches by teams coached', () =>
    coaches.countTeamsByCoach(eraId),
  );
}

export async function resolveCoachCompetitionsPlayedToplist(
  coaches: CoachesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Coaches by competitions played', () =>
    coaches.countCompetitionsByCoach(eraId),
  );
}

export async function resolveCoachErasActiveToplist(
  coaches: CoachesService,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Coaches by eras active', () =>
    coaches.countErasByCoach(),
  );
}

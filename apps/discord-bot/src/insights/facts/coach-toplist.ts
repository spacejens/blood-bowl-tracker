import type { CoachesService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  COACH_TOPLIST_NO_DATA_MESSAGE,
  COACH_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { resolveToplist } from '../leaderboard';

export async function resolveCoachMatchesPlayedToplist(
  coaches: CoachesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Coaches by matches played',
    () => coaches.countMatchesPlayedByCoach(eraId),
    COACH_TOPLIST_TIMEOUT_MESSAGE,
    COACH_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveCoachTeamsToplist(
  coaches: CoachesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Coaches by teams coached',
    () => coaches.countTeamsByCoach(eraId),
    COACH_TOPLIST_TIMEOUT_MESSAGE,
    COACH_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveCoachCompetitionsPlayedToplist(
  coaches: CoachesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Coaches by competitions played',
    () => coaches.countCompetitionsByCoach(eraId),
    COACH_TOPLIST_TIMEOUT_MESSAGE,
    COACH_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveCoachErasActiveToplist(
  coaches: CoachesService,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Coaches by eras active',
    () => coaches.countErasByCoach(),
    COACH_TOPLIST_TIMEOUT_MESSAGE,
    COACH_TOPLIST_NO_DATA_MESSAGE,
  );
}

import type { CoachesService, FactScope } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  COACH_TOPLIST_NO_DATA_MESSAGE,
  COACH_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../slash-commands/deepdive-command.service';
import { resolveToplist } from '../leaderboard';

function coachButtonId(row: { coachId: number }): string {
  return `${COACH_BUTTON_CUSTOM_ID_PREFIX}${row.coachId}`;
}

export async function resolveCoachMatchesPlayedToplist(
  coaches: CoachesService,
  scope: FactScope,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Coaches by matches played',
    fetchRows: () => coaches.countMatchesPlayedByCoach(scope),
    timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: coachButtonId,
  });
}

export async function resolveCoachTeamsToplist(
  coaches: CoachesService,
  scope: FactScope,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Coaches by teams coached',
    fetchRows: () => coaches.countTeamsByCoach(scope),
    timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: coachButtonId,
  });
}

export async function resolveCoachCompetitionsPlayedToplist(
  coaches: CoachesService,
  scope: FactScope,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Coaches by competitions played',
    fetchRows: () => coaches.countCompetitionsByCoach(scope),
    timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: coachButtonId,
  });
}

export async function resolveCoachErasActiveToplist(
  coaches: CoachesService,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Coaches by eras active',
    fetchRows: () => coaches.countErasByCoach(),
    timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: coachButtonId,
  });
}

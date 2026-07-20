import type { RacesService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  RACE_TOPLIST_NO_DATA_MESSAGE,
  RACE_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { RACE_BUTTON_CUSTOM_ID_PREFIX } from '../../slash-commands/deepdive-command.service';
import { resolveToplist } from '../leaderboard';

function raceButtonId(row: { raceId: number }): string {
  return `${RACE_BUTTON_CUSTOM_ID_PREFIX}${row.raceId}`;
}

export async function resolveRaceTeamsToplist(
  races: RacesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Races by teams',
    fetchRows: () => races.countTeamsByRace(eraId),
    timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: RACE_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: raceButtonId,
  });
}

export async function resolveRaceMatchesPlayedToplist(
  races: RacesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Races by matches played',
    fetchRows: () => races.countMatchesPlayedByRace(eraId),
    timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: RACE_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: raceButtonId,
  });
}

import type { RacesService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  RACE_TOPLIST_NO_DATA_MESSAGE,
  RACE_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { resolveToplist } from '../leaderboard';

export async function resolveRaceTeamsToplist(
  races: RacesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Races by teams',
    fetchRows: () => races.countTeamsByRace(eraId),
    timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: RACE_TOPLIST_NO_DATA_MESSAGE,
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
  });
}

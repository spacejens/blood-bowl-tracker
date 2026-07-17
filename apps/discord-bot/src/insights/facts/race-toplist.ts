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
  return resolveToplist(
    'Races by teams',
    () => races.countTeamsByRace(eraId),
    RACE_TOPLIST_TIMEOUT_MESSAGE,
    RACE_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveRaceMatchesPlayedToplist(
  races: RacesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Races by matches played',
    () => races.countMatchesPlayedByRace(eraId),
    RACE_TOPLIST_TIMEOUT_MESSAGE,
    RACE_TOPLIST_NO_DATA_MESSAGE,
  );
}

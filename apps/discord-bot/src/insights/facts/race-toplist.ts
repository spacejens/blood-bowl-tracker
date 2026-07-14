import type { RacesService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { resolveToplist } from '../leaderboard';

export async function resolveRaceTeamsToplist(
  races: RacesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by race', () => races.countTeamsByRace(eraId));
}

export async function resolveRaceMatchesPlayedToplist(
  races: RacesService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Matches played by race', () =>
    races.countMatchesPlayedByRace(eraId),
  );
}

import type { TeamsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { resolveToplist } from '../leaderboard';

export async function resolveTeamMatchesPlayedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by matches played', () =>
    teams.countMatchesPlayedByTeam(eraId),
  );
}

export async function resolveTeamCompetitionsPlayedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by competitions played', () =>
    teams.countCompetitionsByTeam(eraId),
  );
}

export async function resolveTeamErasActiveToplist(
  teams: TeamsService,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by eras active', () => teams.countErasByTeam());
}

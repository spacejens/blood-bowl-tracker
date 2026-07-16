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

export async function resolveTeamTouchdownsScoredToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by touchdowns scored', () =>
    teams.countTouchdownsScoredByTeam(eraId),
  );
}

export async function resolveTeamCompletionsToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by completions', () =>
    teams.countCompletionsByTeam(eraId),
  );
}

export async function resolveTeamInterceptionsToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by interceptions', () =>
    teams.countInterceptionsByTeam(eraId),
  );
}

export async function resolveTeamDeflectionsToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by deflections', () =>
    teams.countDeflectionsByTeam(eraId),
  );
}

export async function resolveTeamCasualtiesCausedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by casualties inflicted', () =>
    teams.countCasualtiesCausedByTeam(eraId),
  );
}

export async function resolveTeamSeriousInjuriesCausedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by serious injuries inflicted', () =>
    teams.countSeriousInjuriesCausedByTeam(eraId),
  );
}

export async function resolveTeamDeathsCausedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by opponents killed', () =>
    teams.countDeathsCausedByTeam(eraId),
  );
}

export async function resolveTeamFoulsCommittedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by fouls committed', () =>
    teams.countFoulsCommittedByTeam(eraId),
  );
}

export async function resolveTeamTimesSentOffToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by times sent off', () =>
    teams.countTimesSentOffByTeam(eraId),
  );
}

export async function resolveTeamCasualtiesSufferedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by casualties suffered', () =>
    teams.countCasualtiesSufferedByTeam(eraId),
  );
}

export async function resolveTeamSeriousInjuriesSufferedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by serious injuries suffered', () =>
    teams.countSeriousInjuriesSufferedByTeam(eraId),
  );
}

export async function resolveTeamLastingInjuriesSufferedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by lasting injuries suffered', () =>
    teams.countLastingInjuriesSufferedByTeam(eraId),
  );
}

export async function resolveTeamDeathsSufferedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by deaths suffered', () =>
    teams.countDeathsSufferedByTeam(eraId),
  );
}

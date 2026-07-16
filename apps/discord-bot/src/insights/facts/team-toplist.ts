import type { TeamsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { resolveToplist } from '../leaderboard';

export async function resolveTeamMatchesPlayedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by matches played', () =>
    teams.countMatchesPlayedByTeam(eraId, competitionId),
  );
}

export async function resolveTeamCompetitionsPlayedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by competitions played', () =>
    teams.countCompetitionsByTeam(eraId, competitionId),
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
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by touchdowns scored', () =>
    teams.countTouchdownsScoredByTeam(eraId, competitionId),
  );
}

export async function resolveTeamCompletionsToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by completions', () =>
    teams.countCompletionsByTeam(eraId, competitionId),
  );
}

export async function resolveTeamInterceptionsToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by interceptions', () =>
    teams.countInterceptionsByTeam(eraId, competitionId),
  );
}

export async function resolveTeamDeflectionsToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by deflections', () =>
    teams.countDeflectionsByTeam(eraId, competitionId),
  );
}

export async function resolveTeamCasualtiesCausedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by casualties inflicted', () =>
    teams.countCasualtiesCausedByTeam(eraId, competitionId),
  );
}

export async function resolveTeamSeriousInjuriesCausedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by serious injuries inflicted', () =>
    teams.countSeriousInjuriesCausedByTeam(eraId, competitionId),
  );
}

export async function resolveTeamDeathsCausedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by opponents killed', () =>
    teams.countDeathsCausedByTeam(eraId, competitionId),
  );
}

export async function resolveTeamFoulsCommittedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by fouls committed', () =>
    teams.countFoulsCommittedByTeam(eraId, competitionId),
  );
}

export async function resolveTeamTimesSentOffToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by times sent off', () =>
    teams.countTimesSentOffByTeam(eraId, competitionId),
  );
}

export async function resolveTeamCasualtiesSufferedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by casualties suffered', () =>
    teams.countCasualtiesSufferedByTeam(eraId, competitionId),
  );
}

export async function resolveTeamSeriousInjuriesSufferedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by serious injuries suffered', () =>
    teams.countSeriousInjuriesSufferedByTeam(eraId, competitionId),
  );
}

export async function resolveTeamLastingInjuriesSufferedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by lasting injuries suffered', () =>
    teams.countLastingInjuriesSufferedByTeam(eraId, competitionId),
  );
}

export async function resolveTeamDeathsSufferedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist('Teams by deaths suffered', () =>
    teams.countDeathsSufferedByTeam(eraId, competitionId),
  );
}

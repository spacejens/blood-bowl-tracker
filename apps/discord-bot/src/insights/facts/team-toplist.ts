import type { TeamsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  TEAM_TOPLIST_NO_DATA_MESSAGE,
  TEAM_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { resolveToplist } from '../leaderboard';

export async function resolveTeamMatchesPlayedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by matches played',
    () => teams.countMatchesPlayedByTeam(eraId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamCompetitionsPlayedToplist(
  teams: TeamsService,
  eraId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by competitions played',
    () => teams.countCompetitionsByTeam(eraId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamErasActiveToplist(
  teams: TeamsService,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by eras active',
    () => teams.countErasByTeam(),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamTouchdownsScoredToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by touchdowns scored',
    () => teams.countTouchdownsScoredByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamCompletionsToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by completions',
    () => teams.countCompletionsByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamInterceptionsToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by interceptions',
    () => teams.countInterceptionsByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamDeflectionsToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by deflections',
    () => teams.countDeflectionsByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamCasualtiesCausedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by casualties inflicted',
    () => teams.countCasualtiesCausedByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamSeriousInjuriesCausedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by serious injuries inflicted',
    () => teams.countSeriousInjuriesCausedByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamDeathsCausedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by opponents killed',
    () => teams.countDeathsCausedByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamFoulsCommittedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by fouls committed',
    () => teams.countFoulsCommittedByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamTimesSentOffToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by times sent off',
    () => teams.countTimesSentOffByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamCasualtiesSufferedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by casualties suffered',
    () => teams.countCasualtiesSufferedByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamSeriousInjuriesSufferedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by serious injuries suffered',
    () => teams.countSeriousInjuriesSufferedByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamLastingInjuriesSufferedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by lasting injuries suffered',
    () => teams.countLastingInjuriesSufferedByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

export async function resolveTeamDeathsSufferedToplist(
  teams: TeamsService,
  eraId?: number,
  competitionId?: number,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist(
    'Teams by deaths suffered',
    () => teams.countDeathsSufferedByTeam(eraId, competitionId),
    TEAM_TOPLIST_TIMEOUT_MESSAGE,
    TEAM_TOPLIST_NO_DATA_MESSAGE,
  );
}

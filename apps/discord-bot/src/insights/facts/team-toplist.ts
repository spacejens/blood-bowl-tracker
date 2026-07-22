import type { FactScope, TeamsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  TEAM_TOPLIST_NO_DATA_MESSAGE,
  TEAM_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../slash-commands/deepdive-command.service';
import { resolveToplist } from '../leaderboard';
import type { ScopedCountMethods } from './toplist-factory';
import { makeToplistResolvers } from './toplist-factory';

export function teamButtonId(row: { teamId: number }): string {
  return `${TEAM_BUTTON_CUSTOM_ID_PREFIX}${row.teamId}`;
}

/**
 * `countMatchesPlayedByTeam`, `countCompetitionsByTeam`, and `countErasByTeam`
 * take fewer parameters than the (eraId?, competitionId?) shape the factory
 * binds to, but a function accepting fewer optional parameters is still
 * assignable to one expecting more, so `ScopedCountMethods<TeamsService>`
 * would otherwise include them too. Naming the 13 uniform methods explicitly
 * keeps those three out and still gets checked against `ScopedCountMethods`
 * via `satisfies` below, so a genuinely mismatched entry still fails to
 * compile.
 */
const _teamToplistMethods = [
  'countTouchdownsScoredByTeam',
  'countCompletionsByTeam',
  'countInterceptionsByTeam',
  'countDeflectionsByTeam',
  'countCasualtiesCausedByTeam',
  'countSeriousInjuriesCausedByTeam',
  'countDeathsCausedByTeam',
  'countFoulsCommittedByTeam',
  'countTimesSentOffByTeam',
  'countCasualtiesSufferedByTeam',
  'countSeriousInjuriesSufferedByTeam',
  'countLastingInjuriesSufferedByTeam',
  'countDeathsSufferedByTeam',
] as const satisfies readonly ScopedCountMethods<TeamsService>[];
type TeamToplistMethod = (typeof _teamToplistMethods)[number];

const resolvers = makeToplistResolvers<
  TeamToplistMethod,
  TeamsService,
  { teamId: number; name: string; count: number }
>({
  titles: {
    countTouchdownsScoredByTeam: 'Teams by touchdowns scored',
    countCompletionsByTeam: 'Teams by completions',
    countInterceptionsByTeam: 'Teams by interceptions',
    countDeflectionsByTeam: 'Teams by deflections',
    countCasualtiesCausedByTeam: 'Teams by casualties inflicted',
    countSeriousInjuriesCausedByTeam: 'Teams by serious injuries inflicted',
    countDeathsCausedByTeam: 'Teams by opponents killed',
    countFoulsCommittedByTeam: 'Teams by fouls committed',
    countTimesSentOffByTeam: 'Teams by times sent off',
    countCasualtiesSufferedByTeam: 'Teams by casualties suffered',
    countSeriousInjuriesSufferedByTeam: 'Teams by serious injuries suffered',
    countLastingInjuriesSufferedByTeam: 'Teams by lasting injuries suffered',
    countDeathsSufferedByTeam: 'Teams by deaths suffered',
  },
  timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
  noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
  buildCustomId: teamButtonId,
});

export const resolveTeamTouchdownsScoredToplist =
  resolvers.countTouchdownsScoredByTeam;
export const resolveTeamCompletionsToplist = resolvers.countCompletionsByTeam;
export const resolveTeamInterceptionsToplist =
  resolvers.countInterceptionsByTeam;
export const resolveTeamDeflectionsToplist = resolvers.countDeflectionsByTeam;
export const resolveTeamCasualtiesCausedToplist =
  resolvers.countCasualtiesCausedByTeam;
export const resolveTeamSeriousInjuriesCausedToplist =
  resolvers.countSeriousInjuriesCausedByTeam;
export const resolveTeamDeathsCausedToplist = resolvers.countDeathsCausedByTeam;
export const resolveTeamFoulsCommittedToplist =
  resolvers.countFoulsCommittedByTeam;
export const resolveTeamTimesSentOffToplist = resolvers.countTimesSentOffByTeam;
export const resolveTeamCasualtiesSufferedToplist =
  resolvers.countCasualtiesSufferedByTeam;
export const resolveTeamSeriousInjuriesSufferedToplist =
  resolvers.countSeriousInjuriesSufferedByTeam;
export const resolveTeamLastingInjuriesSufferedToplist =
  resolvers.countLastingInjuriesSufferedByTeam;
export const resolveTeamDeathsSufferedToplist =
  resolvers.countDeathsSufferedByTeam;

/**
 * The three toplists below take a narrower scope than the table above allows
 * (matches played and competitions played are era-scoped only; eras active is
 * unscoped), so they stay hand-written rather than widening their public
 * signatures to accept a competitionId they would ignore.
 */
export async function resolveTeamMatchesPlayedToplist(
  teams: TeamsService,
  scope: FactScope,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Teams by matches played',
    fetchRows: (limit: number) => teams.countMatchesPlayedByTeam(scope, limit),
    timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: teamButtonId,
  });
}

export async function resolveTeamCompetitionsPlayedToplist(
  teams: TeamsService,
  scope: FactScope,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Teams by competitions played',
    fetchRows: (limit: number) => teams.countCompetitionsByTeam(scope, limit),
    timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: teamButtonId,
  });
}

export async function resolveTeamErasActiveToplist(
  teams: TeamsService,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Teams by eras active',
    fetchRows: (limit: number) => teams.countErasByTeam(limit),
    timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: teamButtonId,
  });
}

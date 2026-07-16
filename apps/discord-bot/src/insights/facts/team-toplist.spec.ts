import type { TeamsService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveTeamCasualtiesCausedToplist,
  resolveTeamCasualtiesSufferedToplist,
  resolveTeamCompetitionsPlayedToplist,
  resolveTeamCompletionsToplist,
  resolveTeamDeathsCausedToplist,
  resolveTeamDeathsSufferedToplist,
  resolveTeamDeflectionsToplist,
  resolveTeamErasActiveToplist,
  resolveTeamFoulsCommittedToplist,
  resolveTeamInterceptionsToplist,
  resolveTeamLastingInjuriesSufferedToplist,
  resolveTeamMatchesPlayedToplist,
  resolveTeamSeriousInjuriesCausedToplist,
  resolveTeamSeriousInjuriesSufferedToplist,
  resolveTeamTimesSentOffToplist,
  resolveTeamTouchdownsScoredToplist,
} from './team-toplist';
import {
  expectLeaderboardEmbed,
  expectStunnedOnTimeout,
} from './toplist.test-helpers';

interface TeamCase {
  describeName: string;
  method: keyof TeamsService;
  resolve: (teams: TeamsService, eraId?: number) => Promise<unknown>;
  rows: { teamId: number; name: string; count: number }[];
  expectedTitle: string;
  expectedDescription: string;
  eraRows?: { teamId: number; name: string; count: number }[];
}

const cases: TeamCase[] = [
  {
    describeName: 'resolveTeamMatchesPlayedToplist',
    method: 'countMatchesPlayedByTeam',
    resolve: (teams) => resolveTeamMatchesPlayedToplist(teams),
    rows: [{ teamId: 1, name: '40 grinders', count: 12 }],
    expectedTitle: 'Teams by matches played',
    expectedDescription: '1. 40 grinders — 12',
  },
  {
    describeName: 'resolveTeamCompetitionsPlayedToplist',
    method: 'countCompetitionsByTeam',
    resolve: (teams, eraId) =>
      resolveTeamCompetitionsPlayedToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    expectedTitle: 'Teams by competitions played',
    expectedDescription: '1. 40 grinders — 4',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
  },
  {
    describeName: 'resolveTeamErasActiveToplist',
    method: 'countErasByTeam',
    resolve: (teams) => resolveTeamErasActiveToplist(teams),
    rows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    expectedTitle: 'Teams by eras active',
    expectedDescription: '1. 40 grinders — 3',
  },
  {
    describeName: 'resolveTeamTouchdownsScoredToplist',
    method: 'countTouchdownsScoredByTeam',
    resolve: (teams, eraId) => resolveTeamTouchdownsScoredToplist(teams, eraId),
    rows: [
      { teamId: 1, name: '40 grinders', count: 15 },
      { teamId: 2, name: 'Gouged Eye', count: 15 },
      { teamId: 3, name: 'Reikland Reavers', count: 6 },
    ],
    expectedTitle: 'Teams by touchdowns scored',
    expectedDescription:
      '1. 40 grinders — 15\n1. Gouged Eye — 15\n2. Reikland Reavers — 6',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
  },
  {
    describeName: 'resolveTeamCompletionsToplist',
    method: 'countCompletionsByTeam',
    resolve: (teams, eraId) => resolveTeamCompletionsToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 8 }],
    expectedTitle: 'Teams by completions',
    expectedDescription: '1. 40 grinders — 8',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
  },
  {
    describeName: 'resolveTeamInterceptionsToplist',
    method: 'countInterceptionsByTeam',
    resolve: (teams, eraId) => resolveTeamInterceptionsToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 5 }],
    expectedTitle: 'Teams by interceptions',
    expectedDescription: '1. 40 grinders — 5',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
  },
  {
    describeName: 'resolveTeamDeflectionsToplist',
    method: 'countDeflectionsByTeam',
    resolve: (teams, eraId) => resolveTeamDeflectionsToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    expectedTitle: 'Teams by deflections',
    expectedDescription: '1. 40 grinders — 4',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
  },
  {
    describeName: 'resolveTeamCasualtiesCausedToplist',
    method: 'countCasualtiesCausedByTeam',
    resolve: (teams, eraId) => resolveTeamCasualtiesCausedToplist(teams, eraId),
    rows: [
      { teamId: 1, name: '40 grinders', count: 22 },
      { teamId: 2, name: 'Gouged Eye', count: 22 },
      { teamId: 3, name: 'Reikland Reavers', count: 9 },
    ],
    expectedTitle: 'Teams by casualties inflicted',
    expectedDescription:
      '1. 40 grinders — 22\n1. Gouged Eye — 22\n2. Reikland Reavers — 9',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
  },
  {
    describeName: 'resolveTeamSeriousInjuriesCausedToplist',
    method: 'countSeriousInjuriesCausedByTeam',
    resolve: (teams, eraId) =>
      resolveTeamSeriousInjuriesCausedToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 7 }],
    expectedTitle: 'Teams by serious injuries inflicted',
    expectedDescription: '1. 40 grinders — 7',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
  },
  {
    describeName: 'resolveTeamDeathsCausedToplist',
    method: 'countDeathsCausedByTeam',
    resolve: (teams, eraId) => resolveTeamDeathsCausedToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    expectedTitle: 'Teams by opponents killed',
    expectedDescription: '1. 40 grinders — 4',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
  },
  {
    describeName: 'resolveTeamFoulsCommittedToplist',
    method: 'countFoulsCommittedByTeam',
    resolve: (teams, eraId) => resolveTeamFoulsCommittedToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 13 }],
    expectedTitle: 'Teams by fouls committed',
    expectedDescription: '1. 40 grinders — 13',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
  },
  {
    describeName: 'resolveTeamTimesSentOffToplist',
    method: 'countTimesSentOffByTeam',
    resolve: (teams, eraId) => resolveTeamTimesSentOffToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 8 }],
    expectedTitle: 'Teams by times sent off',
    expectedDescription: '1. 40 grinders — 8',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
  },
  {
    describeName: 'resolveTeamCasualtiesSufferedToplist',
    method: 'countCasualtiesSufferedByTeam',
    resolve: (teams, eraId) =>
      resolveTeamCasualtiesSufferedToplist(teams, eraId),
    rows: [
      { teamId: 1, name: '40 grinders', count: 18 },
      { teamId: 2, name: 'Gouged Eye', count: 18 },
      { teamId: 3, name: 'Chaos All-Stars', count: 5 },
    ],
    expectedTitle: 'Teams by casualties suffered',
    expectedDescription:
      '1. 40 grinders — 18\n1. Gouged Eye — 18\n2. Chaos All-Stars — 5',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
  },
  {
    describeName: 'resolveTeamSeriousInjuriesSufferedToplist',
    method: 'countSeriousInjuriesSufferedByTeam',
    resolve: (teams, eraId) =>
      resolveTeamSeriousInjuriesSufferedToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 6 }],
    expectedTitle: 'Teams by serious injuries suffered',
    expectedDescription: '1. 40 grinders — 6',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
  },
  {
    describeName: 'resolveTeamLastingInjuriesSufferedToplist',
    method: 'countLastingInjuriesSufferedByTeam',
    resolve: (teams, eraId) =>
      resolveTeamLastingInjuriesSufferedToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    expectedTitle: 'Teams by lasting injuries suffered',
    expectedDescription: '1. 40 grinders — 4',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
  },
  {
    describeName: 'resolveTeamDeathsSufferedToplist',
    method: 'countDeathsSufferedByTeam',
    resolve: (teams, eraId) => resolveTeamDeathsSufferedToplist(teams, eraId),
    rows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by deaths suffered',
    expectedDescription: '1. 40 grinders — 2',
    eraRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
  },
];

describe.each(cases)(
  '$describeName',
  ({ method, resolve, rows, expectedTitle, expectedDescription, eraRows }) => {
    it('returns a leaderboard embed built from the query rows', async () => {
      const teams = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as TeamsService;
      const result = await resolve(teams);
      expectLeaderboardEmbed(result, expectedTitle, expectedDescription);
    });

    if (eraRows) {
      it('passes the era id through to the query', async () => {
        const queryFn = vi.fn().mockResolvedValue(eraRows);
        const teams = { [method]: queryFn } as unknown as TeamsService;
        await resolve(teams, 20);
        expect(queryFn).toHaveBeenCalledWith(20);
      });
    }

    it('falls back to "I am stunned" when the query does not respond in time', async () => {
      await expectStunnedOnTimeout(
        (teams: TeamsService) => resolve(teams),
        () =>
          ({
            [method]: vi.fn().mockReturnValue(new Promise(() => {})),
          }) as unknown as TeamsService,
      );
    });
  },
);

import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  FACT_SCOPE_ALL_TIME,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { TEAM_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { TeamToplistService } from './team-toplist.service';

interface MadeService {
  service: TeamToplistService;
  leaderboard: MockProxy<LeaderboardService>;
}

async function makeService(teams: TeamsService): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      TeamToplistService,
      { provide: TeamsService, useValue: teams },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(TeamToplistService), leaderboard };
}

interface TeamCase {
  describeName: string;
  method: keyof TeamsService;
  resolve: (service: TeamToplistService, scope?: FactScope) => Promise<unknown>;
  rows: { teamId: number; name: string; count: number }[];
  eraRows?: { teamId: number; name: string; count: number }[];
  competitionRows?: { teamId: number; name: string; count: number }[];
  expectedTitle: string;
}

const cases: TeamCase[] = [
  {
    describeName: 'resolveMatchesPlayed',
    method: 'countMatchesPlayedByTeam',
    resolve: (service, scope) =>
      service.resolveMatchesPlayed(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 12 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 5 }],
    expectedTitle: 'Teams by matches played',
  },
  {
    describeName: 'resolveCompetitionsPlayed',
    method: 'countCompetitionsByTeam',
    resolve: (service, scope) =>
      service.resolveCompetitionsPlayed(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by competitions played',
  },
  {
    describeName: 'resolveErasActive',
    method: 'countErasByTeam',
    resolve: (service) => service.resolveErasActive(),
    rows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    expectedTitle: 'Teams by eras active',
  },
  {
    describeName: 'resolveTouchdownsScored',
    method: 'countTouchdownsScoredByTeam',
    resolve: (service, scope) =>
      service.resolveTouchdownsScored(scope as FactScope),
    rows: [
      { teamId: 1, name: '40 grinders', count: 15 },
      { teamId: 2, name: 'Gouged Eye', count: 15 },
      { teamId: 3, name: 'Reikland Reavers', count: 6 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by touchdowns scored',
  },
  {
    describeName: 'resolveCompletions',
    method: 'countCompletionsByTeam',
    resolve: (service, scope) => service.resolveCompletions(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 8 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by completions',
  },
  {
    describeName: 'resolveInterceptions',
    method: 'countInterceptionsByTeam',
    resolve: (service, scope) =>
      service.resolveInterceptions(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 5 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by interceptions',
  },
  {
    describeName: 'resolveDeflections',
    method: 'countDeflectionsByTeam',
    resolve: (service, scope) => service.resolveDeflections(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by deflections',
  },
  {
    describeName: 'resolveCasualtiesCaused',
    method: 'countCasualtiesCausedByTeam',
    resolve: (service, scope) =>
      service.resolveCasualtiesCaused(scope as FactScope),
    rows: [
      { teamId: 1, name: '40 grinders', count: 22 },
      { teamId: 2, name: 'Gouged Eye', count: 22 },
      { teamId: 3, name: 'Reikland Reavers', count: 9 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by casualties inflicted',
  },
  {
    describeName: 'resolveSeriousInjuriesCaused',
    method: 'countSeriousInjuriesCausedByTeam',
    resolve: (service, scope) =>
      service.resolveSeriousInjuriesCaused(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 7 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by serious injuries inflicted',
  },
  {
    describeName: 'resolveDeathsCaused',
    method: 'countDeathsCausedByTeam',
    resolve: (service, scope) =>
      service.resolveDeathsCaused(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by opponents killed',
  },
  {
    describeName: 'resolveFoulsCommitted',
    method: 'countFoulsCommittedByTeam',
    resolve: (service, scope) =>
      service.resolveFoulsCommitted(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 13 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by fouls committed',
  },
  {
    describeName: 'resolveTimesSentOff',
    method: 'countTimesSentOffByTeam',
    resolve: (service, scope) =>
      service.resolveTimesSentOff(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 8 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by times sent off',
  },
  {
    describeName: 'resolveCasualtiesSuffered',
    method: 'countCasualtiesSufferedByTeam',
    resolve: (service, scope) =>
      service.resolveCasualtiesSuffered(scope as FactScope),
    rows: [
      { teamId: 1, name: '40 grinders', count: 18 },
      { teamId: 2, name: 'Gouged Eye', count: 18 },
      { teamId: 3, name: 'Chaos All-Stars', count: 5 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by casualties suffered',
  },
  {
    describeName: 'resolveSeriousInjuriesSuffered',
    method: 'countSeriousInjuriesSufferedByTeam',
    resolve: (service, scope) =>
      service.resolveSeriousInjuriesSuffered(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 6 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by serious injuries suffered',
  },
  {
    describeName: 'resolveLastingInjuriesSuffered',
    method: 'countLastingInjuriesSufferedByTeam',
    resolve: (service, scope) =>
      service.resolveLastingInjuriesSuffered(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by lasting injuries suffered',
  },
  {
    describeName: 'resolveDeathsSuffered',
    method: 'countDeathsSufferedByTeam',
    resolve: (service, scope) =>
      service.resolveDeathsSuffered(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by deaths suffered',
  },
];

describe.each(cases)(
  'TeamToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle, eraRows, competitionRows }) => {
    // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
    // rendering) is covered by leaderboard.service.spec.ts. Here `leaderboard`
    // is a mock returning a canned reply, so this test only asserts what
    // TeamToplistService itself owns: the embed title it configures, and the
    // per-row deepdive entityLink it configures.
    it('wires the embed title and per-row deepdive button id', async () => {
      const teams = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as TeamsService;
      const { service, leaderboard } = await makeService(teams);
      const canned = {
        embeds: [{ title: 'canned', description: 'canned' }],
      };
      leaderboard.resolveToplist.mockResolvedValueOnce(canned);
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(canned);
      const options = leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<(typeof rows)[number]>;
      expect(options.title).toBe(expectedTitle);
      expect(options.entityLink?.customIdPrefix).toBe(
        TEAM_BUTTON_CUSTOM_ID_PREFIX,
      );
      expect(options.entityLink?.entityId(rows[0])).toBe(rows[0].teamId);
    });

    if (eraRows) {
      it('passes the era id through to the query', async () => {
        const queryFn = vi.fn().mockResolvedValue(eraRows);
        const teams = { [method]: queryFn } as unknown as TeamsService;
        const { service, leaderboard } = await makeService(teams);
        leaderboard.resolveToplist.mockImplementation(async (options) => {
          await options.fetchRows(TOPLIST_FETCH_LIMIT);
          return 'canned';
        });
        await resolve(service, { eraId: 20 });
        expect(queryFn).toHaveBeenCalledWith(
          { eraId: 20 },
          TOPLIST_FETCH_LIMIT,
        );
      });
    }

    if (competitionRows) {
      it('passes the competition id through to the query', async () => {
        const queryFn = vi.fn().mockResolvedValue(competitionRows);
        const teams = { [method]: queryFn } as unknown as TeamsService;
        const { service, leaderboard } = await makeService(teams);
        leaderboard.resolveToplist.mockImplementation(async (options) => {
          await options.fetchRows(TOPLIST_FETCH_LIMIT);
          return 'canned';
        });
        await resolve(service, { competitionId: 30 });
        expect(queryFn).toHaveBeenCalledWith(
          { competitionId: 30 },
          TOPLIST_FETCH_LIMIT,
        );
      });
    }

    it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
      const teams = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as TeamsService;
      const { service, leaderboard } = await makeService(teams);
      leaderboard.resolveToplist.mockResolvedValueOnce(
        TEAM_TOPLIST_TIMEOUT_MESSAGE,
      );
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(TEAM_TOPLIST_TIMEOUT_MESSAGE);
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
        }),
      );
    });
  },
);

describe('TeamToplistService.resolveErasActive', () => {
  it('passes the fetch limit through to the query', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const teams = { countErasByTeam: queryFn } as unknown as TeamsService;
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveErasActive();
    expect(queryFn).toHaveBeenCalledWith(TOPLIST_FETCH_LIMIT);
  });
});

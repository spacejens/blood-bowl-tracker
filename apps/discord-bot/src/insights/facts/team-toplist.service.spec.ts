import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  FACT_SCOPE_ALL_TIME,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';

import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { TEAM_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { TeamToplistService } from './team-toplist.service';
import { makeLeaderboardMock } from './toplist.test-helpers';

interface MadeService {
  service: TeamToplistService;
  leaderboard: MockProxy<LeaderboardService>;
}

async function makeService(teams: TeamsService): Promise<MadeService> {
  const leaderboard = makeLeaderboardMock();
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
  expectedDescription: string;
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
    expectedDescription: '1. 40 grinders — 12',
  },
  {
    describeName: 'resolveCompetitionsPlayed',
    method: 'countCompetitionsByTeam',
    resolve: (service, scope) =>
      service.resolveCompetitionsPlayed(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by competitions played',
    expectedDescription: '1. 40 grinders — 4',
  },
  {
    describeName: 'resolveErasActive',
    method: 'countErasByTeam',
    resolve: (service) => service.resolveErasActive(),
    rows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    expectedTitle: 'Teams by eras active',
    expectedDescription: '1. 40 grinders — 3',
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
    expectedDescription:
      '1. 40 grinders — 15\n1. Gouged Eye — 15\n2. Reikland Reavers — 6',
  },
  {
    describeName: 'resolveCompletions',
    method: 'countCompletionsByTeam',
    resolve: (service, scope) => service.resolveCompletions(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 8 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by completions',
    expectedDescription: '1. 40 grinders — 8',
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
    expectedDescription: '1. 40 grinders — 5',
  },
  {
    describeName: 'resolveDeflections',
    method: 'countDeflectionsByTeam',
    resolve: (service, scope) => service.resolveDeflections(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by deflections',
    expectedDescription: '1. 40 grinders — 4',
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
    expectedDescription:
      '1. 40 grinders — 22\n1. Gouged Eye — 22\n2. Reikland Reavers — 9',
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
    expectedDescription: '1. 40 grinders — 7',
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
    expectedDescription: '1. 40 grinders — 4',
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
    expectedDescription: '1. 40 grinders — 13',
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
    expectedDescription: '1. 40 grinders — 8',
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
    expectedDescription:
      '1. 40 grinders — 18\n1. Gouged Eye — 18\n2. Chaos All-Stars — 5',
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
    expectedDescription: '1. 40 grinders — 6',
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
    expectedDescription: '1. 40 grinders — 4',
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
    expectedDescription: '1. 40 grinders — 2',
  },
];

describe.each(cases)(
  'TeamToplistService.$describeName',
  ({
    method,
    resolve,
    rows,
    expectedTitle,
    expectedDescription,
    eraRows,
    competitionRows,
  }) => {
    it('returns a leaderboard embed with one deepdive button per team row', async () => {
      const teams = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as TeamsService;
      const { service } = await makeService(teams);
      const result = (await resolve(service, FACT_SCOPE_ALL_TIME)) as {
        embeds: { title: string; description: string }[];
        components: { components: { label: string; custom_id: string }[] }[];
      };
      expect(result.embeds).toEqual([
        { title: expectedTitle, description: expectedDescription },
      ]);
      const buttons = result.components.flatMap((row) => row.components);
      expect(buttons.map((b) => b.custom_id)).toEqual(
        rows.map((r) => `${TEAM_BUTTON_CUSTOM_ID_PREFIX}${r.teamId}`),
      );
      expect(buttons.map((b) => b.label)).toEqual(rows.map((r) => r.name));
    });

    if (eraRows) {
      it('passes the era id through to the query', async () => {
        const queryFn = vi.fn().mockResolvedValue(eraRows);
        const teams = { [method]: queryFn } as unknown as TeamsService;
        const { service } = await makeService(teams);
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
        const { service } = await makeService(teams);
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
    const { service } = await makeService(teams);
    await service.resolveErasActive();
    expect(queryFn).toHaveBeenCalledWith(TOPLIST_FETCH_LIMIT);
  });
});

describe('TeamToplistService.teamButtonId', () => {
  it('formats the deepdive team button customId', async () => {
    const teams = {} as unknown as TeamsService;
    const { service } = await makeService(teams);
    expect(service.teamButtonId({ teamId: 42 })).toBe(
      `${TEAM_BUTTON_CUSTOM_ID_PREFIX}42`,
    );
  });
});

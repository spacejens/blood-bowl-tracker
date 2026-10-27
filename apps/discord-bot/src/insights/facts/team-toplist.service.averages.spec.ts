import type {
  FactScope,
  TeamAverageDirection,
} from '@blood-bowl-tracker/game-data';
import { TeamsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  TEAM_TOPLIST_NO_DATA_MESSAGE,
  TEAM_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { NumberFormatterService } from '../../shared/number-formatter.service';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { TeamContextService } from '../team-context.service';
import { TeamToplistService } from './team-toplist.service';
import { ToplistFactoryService } from './toplist-factory.service';
import { mockToplistFactory } from './toplist-factory-mock.test-helpers';

type TeamRow = {
  teamId: number;
  name: string;
  count: number;
  contextSuffix?: string;
};

interface AverageCase {
  resolverName: string;
  method:
    | 'averageTouchdownsScoredByTeam'
    | 'averageTouchdownsConcededByTeam'
    | 'averageCasualtiesCausedByTeam'
    | 'averageCasualtiesSufferedByTeam'
    | 'averageSeriousInjuriesCausedByTeam'
    | 'averageSeriousInjuriesSufferedByTeam'
    | 'averageLastingInjuriesSufferedByTeam';
  direction: TeamAverageDirection;
  resolve: (service: TeamToplistService, scope: FactScope) => Promise<unknown>;
  expectedTitle: string;
}

const cases: AverageCase[] = [
  {
    resolverName: 'resolveAverageTouchdownsScoredDescending',
    method: 'averageTouchdownsScoredByTeam',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageTouchdownsScoredDescending(scope),
    expectedTitle:
      'Teams by average touchdowns scored per match (highest first)',
  },
  {
    resolverName: 'resolveAverageTouchdownsScoredAscending',
    method: 'averageTouchdownsScoredByTeam',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageTouchdownsScoredAscending(scope),
    expectedTitle:
      'Teams by average touchdowns scored per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageTouchdownsConcededDescending',
    method: 'averageTouchdownsConcededByTeam',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageTouchdownsConcededDescending(scope),
    expectedTitle:
      'Teams by average touchdowns conceded per match (highest first)',
  },
  {
    resolverName: 'resolveAverageTouchdownsConcededAscending',
    method: 'averageTouchdownsConcededByTeam',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageTouchdownsConcededAscending(scope),
    expectedTitle:
      'Teams by average touchdowns conceded per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageCasualtiesCausedDescending',
    method: 'averageCasualtiesCausedByTeam',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageCasualtiesCausedDescending(scope),
    expectedTitle:
      'Teams by average casualties caused per match (highest first)',
  },
  {
    resolverName: 'resolveAverageCasualtiesCausedAscending',
    method: 'averageCasualtiesCausedByTeam',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageCasualtiesCausedAscending(scope),
    expectedTitle:
      'Teams by average casualties caused per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageCasualtiesSufferedDescending',
    method: 'averageCasualtiesSufferedByTeam',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageCasualtiesSufferedDescending(scope),
    expectedTitle:
      'Teams by average casualties suffered per match (highest first)',
  },
  {
    resolverName: 'resolveAverageCasualtiesSufferedAscending',
    method: 'averageCasualtiesSufferedByTeam',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageCasualtiesSufferedAscending(scope),
    expectedTitle:
      'Teams by average casualties suffered per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageSeriousInjuriesCausedDescending',
    method: 'averageSeriousInjuriesCausedByTeam',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageSeriousInjuriesCausedDescending(scope),
    expectedTitle:
      'Teams by average serious injuries caused per match (highest first)',
  },
  {
    resolverName: 'resolveAverageSeriousInjuriesCausedAscending',
    method: 'averageSeriousInjuriesCausedByTeam',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageSeriousInjuriesCausedAscending(scope),
    expectedTitle:
      'Teams by average serious injuries caused per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageSeriousInjuriesSufferedDescending',
    method: 'averageSeriousInjuriesSufferedByTeam',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageSeriousInjuriesSufferedDescending(scope),
    expectedTitle:
      'Teams by average serious injuries suffered per match (highest first)',
  },
  {
    resolverName: 'resolveAverageSeriousInjuriesSufferedAscending',
    method: 'averageSeriousInjuriesSufferedByTeam',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageSeriousInjuriesSufferedAscending(scope),
    expectedTitle:
      'Teams by average serious injuries suffered per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageLastingInjuriesSufferedDescending',
    method: 'averageLastingInjuriesSufferedByTeam',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageLastingInjuriesSufferedDescending(scope),
    expectedTitle:
      'Teams by average lasting injuries suffered per match (highest first)',
  },
  {
    resolverName: 'resolveAverageLastingInjuriesSufferedAscending',
    method: 'averageLastingInjuriesSufferedByTeam',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageLastingInjuriesSufferedAscending(scope),
    expectedTitle:
      'Teams by average lasting injuries suffered per match (lowest first)',
  },
];

describe.each(cases)(
  'TeamToplistService.$resolverName',
  ({ method, direction, resolve, expectedTitle }) => {
    let service: TeamToplistService;
    let teams: MockProxy<TeamsService>;
    let leaderboard: MockProxy<LeaderboardService>;
    let teamContext: MockProxy<TeamContextService>;

    beforeEach(async () => {
      teams = mock<TeamsService>();
      leaderboard = mock<LeaderboardService>();
      teamContext = mock<TeamContextService>();
      const moduleRef = await Test.createTestingModule({
        providers: [
          TeamToplistService,
          NumberFormatterService,
          { provide: TeamsService, useValue: teams },
          { provide: LeaderboardService, useValue: leaderboard },
          { provide: TeamContextService, useValue: teamContext },
          {
            provide: ToplistFactoryService,
            useValue: mockToplistFactory().factory,
          },
        ],
      }).compile();
      service = moduleRef.get(TeamToplistService);
    });

    function capturedOptions(): ResolveToplistOptions<TeamRow> {
      return leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<TeamRow>;
    }

    it('configures title, messages and the per-row deepdive button, and returns the reply verbatim', async () => {
      const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
      leaderboard.resolveToplist.mockResolvedValueOnce(canned);

      await expect(resolve(service, { leagueId: 9 })).resolves.toBe(canned);
      const options = capturedOptions();
      expect(options.title).toBe(expectedTitle);
      expect(options.timeoutMessage).toBe(TEAM_TOPLIST_TIMEOUT_MESSAGE);
      expect(options.noDataMessage).toBe(TEAM_TOPLIST_NO_DATA_MESSAGE);
      expect(options.entityLink?.customIdPrefix).toBe(
        TEAM_BUTTON_CUSTOM_ID_PREFIX,
      );
      expect(
        options.entityLink?.entityId({ teamId: 7, name: 'x', count: 1 }),
      ).toBe(7);
    });

    it('fetches with the scope and direction, ranks on the average and adds race and coach context', async () => {
      teams[method].mockResolvedValue([
        { teamId: 1, name: '40 grinders', average: 3.42 },
      ]);
      const contextRows: TeamRow[] = [
        { teamId: 1, name: '40 grinders', count: 3.42 },
      ];
      teamContext.attachSuffixes.mockResolvedValue(
        contextRows.map((row) => ({
          ...row,
          contextSuffix: ' (Orc, Skarsnik)',
        })),
      );
      leaderboard.resolveToplist.mockResolvedValueOnce('canned');
      await resolve(service, { eraId: 20 });

      const fetched = await capturedOptions().fetchRows(TOPLIST_FETCH_LIMIT);
      expect(teams[method]).toHaveBeenCalledWith(
        { eraId: 20 },
        direction,
        TOPLIST_FETCH_LIMIT,
      );
      const [inputRows, teamIdOf, contextOptions] =
        teamContext.attachSuffixes.mock.calls[0];
      expect(inputRows).toEqual([
        { teamId: 1, name: '40 grinders', count: 3.42 },
      ]);
      expect(teamIdOf(inputRows[0])).toBe(1);
      expect(contextOptions).toEqual({ includeRace: true, includeCoach: true });
      expect(fetched).toEqual([
        {
          teamId: 1,
          name: '40 grinders',
          count: 3.42,
          contextSuffix: ' (Orc, Skarsnik)',
        },
      ]);
    });

    it('renders the average to two decimals per match', async () => {
      leaderboard.resolveToplist.mockResolvedValueOnce('canned');
      await resolve(service, { leagueId: 9 });
      const { formatRow } = capturedOptions();
      expect(
        formatRow?.({
          teamId: 1,
          name: '40 grinders',
          count: 3.42,
          contextSuffix: ' (Orc, Skarsnik)',
          rank: 1,
        }),
      ).toBe('1. 40 grinders (Orc, Skarsnik) — 3.42 per match');
      expect(
        formatRow?.({ teamId: 2, name: 'Gouged Eye', count: 3, rank: 2 }),
      ).toBe('2. Gouged Eye — 3.00 per match');
    });
  },
);

import type { FactScope } from '@blood-bowl-tracker/game-data';
import type { CoachAverageDirection } from '@blood-bowl-tracker/game-data-queries';
import { CoachAverageStatisticsService } from '@blood-bowl-tracker/game-data-queries';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  COACH_TOPLIST_NO_DATA_MESSAGE,
  COACH_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { NumberFormatterService } from '../../shared/number-formatter.service';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { CoachAverageToplistService } from './coach-average-toplist.service';

interface CoachRow {
  coachId: number;
  name: string;
  count: number;
}

interface AverageCase {
  resolverName: string;
  method:
    | 'averageCasualtiesCausedByCoach'
    | 'averageCasualtiesSufferedByCoach'
    | 'averageSeriousInjuriesCausedByCoach'
    | 'averageSeriousInjuriesSufferedByCoach'
    | 'averageLastingInjuriesCausedByCoach'
    | 'averageLastingInjuriesSufferedByCoach'
    | 'averageDeathsCausedByCoach'
    | 'averageDeathsSufferedByCoach';
  direction: CoachAverageDirection;
  resolve: (
    service: CoachAverageToplistService,
    scope: FactScope,
  ) => Promise<unknown>;
  expectedTitle: string;
}

const cases: AverageCase[] = [
  {
    resolverName: 'resolveAverageCasualtiesCausedDescending',
    method: 'averageCasualtiesCausedByCoach',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageCasualtiesCausedDescending(scope),
    expectedTitle:
      'Coaches by average casualties caused per match (highest first)',
  },
  {
    resolverName: 'resolveAverageCasualtiesCausedAscending',
    method: 'averageCasualtiesCausedByCoach',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageCasualtiesCausedAscending(scope),
    expectedTitle:
      'Coaches by average casualties caused per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageCasualtiesSufferedDescending',
    method: 'averageCasualtiesSufferedByCoach',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageCasualtiesSufferedDescending(scope),
    expectedTitle:
      'Coaches by average casualties suffered per match (highest first)',
  },
  {
    resolverName: 'resolveAverageCasualtiesSufferedAscending',
    method: 'averageCasualtiesSufferedByCoach',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageCasualtiesSufferedAscending(scope),
    expectedTitle:
      'Coaches by average casualties suffered per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageSeriousInjuriesCausedDescending',
    method: 'averageSeriousInjuriesCausedByCoach',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageSeriousInjuriesCausedDescending(scope),
    expectedTitle:
      'Coaches by average serious injuries caused per match (highest first)',
  },
  {
    resolverName: 'resolveAverageSeriousInjuriesCausedAscending',
    method: 'averageSeriousInjuriesCausedByCoach',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageSeriousInjuriesCausedAscending(scope),
    expectedTitle:
      'Coaches by average serious injuries caused per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageSeriousInjuriesSufferedDescending',
    method: 'averageSeriousInjuriesSufferedByCoach',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageSeriousInjuriesSufferedDescending(scope),
    expectedTitle:
      'Coaches by average serious injuries suffered per match (highest first)',
  },
  {
    resolverName: 'resolveAverageSeriousInjuriesSufferedAscending',
    method: 'averageSeriousInjuriesSufferedByCoach',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageSeriousInjuriesSufferedAscending(scope),
    expectedTitle:
      'Coaches by average serious injuries suffered per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageLastingInjuriesCausedDescending',
    method: 'averageLastingInjuriesCausedByCoach',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageLastingInjuriesCausedDescending(scope),
    expectedTitle:
      'Coaches by average lasting injuries caused per match (highest first)',
  },
  {
    resolverName: 'resolveAverageLastingInjuriesCausedAscending',
    method: 'averageLastingInjuriesCausedByCoach',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageLastingInjuriesCausedAscending(scope),
    expectedTitle:
      'Coaches by average lasting injuries caused per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageLastingInjuriesSufferedDescending',
    method: 'averageLastingInjuriesSufferedByCoach',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageLastingInjuriesSufferedDescending(scope),
    expectedTitle:
      'Coaches by average lasting injuries suffered per match (highest first)',
  },
  {
    resolverName: 'resolveAverageLastingInjuriesSufferedAscending',
    method: 'averageLastingInjuriesSufferedByCoach',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageLastingInjuriesSufferedAscending(scope),
    expectedTitle:
      'Coaches by average lasting injuries suffered per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageDeathsCausedDescending',
    method: 'averageDeathsCausedByCoach',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageDeathsCausedDescending(scope),
    expectedTitle: 'Coaches by average deaths caused per match (highest first)',
  },
  {
    resolverName: 'resolveAverageDeathsCausedAscending',
    method: 'averageDeathsCausedByCoach',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageDeathsCausedAscending(scope),
    expectedTitle: 'Coaches by average deaths caused per match (lowest first)',
  },
  {
    resolverName: 'resolveAverageDeathsSufferedDescending',
    method: 'averageDeathsSufferedByCoach',
    direction: 'desc',
    resolve: (service, scope) =>
      service.resolveAverageDeathsSufferedDescending(scope),
    expectedTitle:
      'Coaches by average deaths suffered per match (highest first)',
  },
  {
    resolverName: 'resolveAverageDeathsSufferedAscending',
    method: 'averageDeathsSufferedByCoach',
    direction: 'asc',
    resolve: (service, scope) =>
      service.resolveAverageDeathsSufferedAscending(scope),
    expectedTitle:
      'Coaches by average deaths suffered per match (lowest first)',
  },
];

describe.each(cases)(
  'CoachAverageToplistService.$resolverName',
  ({ method, direction, resolve, expectedTitle }) => {
    let service: CoachAverageToplistService;
    let averages: MockProxy<CoachAverageStatisticsService>;
    let leaderboard: MockProxy<LeaderboardService>;

    beforeEach(async () => {
      averages = mock<CoachAverageStatisticsService>();
      leaderboard = mock<LeaderboardService>();
      const moduleRef = await Test.createTestingModule({
        providers: [
          CoachAverageToplistService,
          // Pure formatting: real, so the rendered row is asserted.
          NumberFormatterService,
          { provide: CoachAverageStatisticsService, useValue: averages },
          { provide: LeaderboardService, useValue: leaderboard },
        ],
      }).compile();
      service = moduleRef.get(CoachAverageToplistService);
    });

    function capturedOptions(): ResolveToplistOptions<CoachRow> {
      return leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<CoachRow>;
    }

    it('configures title, messages and the per-row coach deepdive button, and returns the reply verbatim', async () => {
      const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
      leaderboard.resolveToplist.mockResolvedValueOnce(canned);

      await expect(resolve(service, { leagueId: 9 })).resolves.toBe(canned);
      const options = capturedOptions();
      expect(options.title).toBe(expectedTitle);
      expect(options.timeoutMessage).toBe(COACH_TOPLIST_TIMEOUT_MESSAGE);
      expect(options.noDataMessage).toBe(COACH_TOPLIST_NO_DATA_MESSAGE);
      expect(options.entityLink?.customIdPrefix).toBe(
        COACH_BUTTON_CUSTOM_ID_PREFIX,
      );
      expect(
        options.entityLink?.entityId({ coachId: 7, name: 'x', count: 1 }),
      ).toBe(7);
    });

    it('fetches with the scope and direction and ranks on the average', async () => {
      averages[method].mockResolvedValue([
        { coachId: 1, name: 'Roze Madder', average: 3.42 },
      ]);
      leaderboard.resolveToplist.mockResolvedValueOnce('canned');
      await resolve(service, { eraId: 20 });

      const fetched = await capturedOptions().fetchRows(TOPLIST_FETCH_LIMIT);
      expect(averages[method]).toHaveBeenCalledWith(
        { eraId: 20 },
        direction,
        TOPLIST_FETCH_LIMIT,
      );
      expect(fetched).toEqual([
        { coachId: 1, name: 'Roze Madder', count: 3.42 },
      ]);
    });

    it('renders the average to two decimals per match', async () => {
      leaderboard.resolveToplist.mockResolvedValueOnce('canned');
      await resolve(service, { leagueId: 9 });
      const { formatRow } = capturedOptions();
      expect(
        formatRow?.({ coachId: 1, name: 'Roze Madder', count: 3.42, rank: 1 }),
      ).toBe('1. Roze Madder — 3.42 per match');
      expect(
        formatRow?.({ coachId: 2, name: 'Skarsnik', count: 3, rank: 2 }),
      ).toBe('2. Skarsnik — 3.00 per match');
    });
  },
);

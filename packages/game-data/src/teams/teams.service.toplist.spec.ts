import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { TeamRaceCoachNamesService } from '../shared/team-race-coach-names.service';
import { TeamAverageStatisticsService } from './team-average-statistics.service';
import { TeamsService } from './teams.service';
import { TeamsStatisticsService } from './teams-statistics.service';

describe('TeamsService toplist delegation', () => {
  let service: TeamsService;
  let likePattern: MockProxy<LikePatternService>;
  let statistics: MockProxy<TeamsStatisticsService>;
  let averages: MockProxy<TeamAverageStatisticsService>;
  let teamRaceCoachNames: MockProxy<TeamRaceCoachNamesService>;

  beforeEach(async () => {
    likePattern = mock<LikePatternService>();
    statistics = mock<TeamsStatisticsService>();
    averages = mock<TeamAverageStatisticsService>();
    teamRaceCoachNames = mock<TeamRaceCoachNamesService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: TeamsStatisticsService, useValue: statistics },
        { provide: TeamAverageStatisticsService, useValue: averages },
        { provide: TeamRaceCoachNamesService, useValue: teamRaceCoachNames },
        { provide: DB, useValue: mock<Db>() },
      ],
    }).compile();
    service = moduleRef.get(TeamsService);
  });

  it.each([
    'countMatchesPlayedByTeam',
    'countMatchesWonByTeam',
    'countMatchesLostByTeam',
    'countMatchesDrawnByTeam',
    'countCompetitionsByTeam',
    'countTouchdownsScoredByTeam',
    'countCompletionsByTeam',
    'countInterceptionsByTeam',
    'countDeflectionsByTeam',
    'countCasualtiesCausedByTeam',
    'countSeriousInjuriesCausedByTeam',
    'countDeathsCausedByTeam',
    'countFoulsCommittedByTeam',
    'countTimesSentOffByTeam',
    'countTrophiesByTeam',
  ] as const)(
    '%s delegates to TeamsStatisticsService and returns its result',
    async (method) => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 6 }];
      statistics[method].mockResolvedValue(rows);

      await expect(service[method](FACT_SCOPE_ALL_TIME, 21)).resolves.toEqual(
        rows,
      );

      expect(statistics[method]).toHaveBeenCalledWith(FACT_SCOPE_ALL_TIME, 21);
    },
  );

  it('countErasByTeam delegates to TeamsStatisticsService and returns its result', async () => {
    const rows = [{ teamId: 1, name: '40 grinders', count: 3 }];
    statistics.countErasByTeam.mockResolvedValue(rows);

    await expect(service.countErasByTeam(21)).resolves.toEqual(rows);

    expect(statistics.countErasByTeam).toHaveBeenCalledWith(21);
  });

  it.each([
    'averageTouchdownsScoredByTeam',
    'averageTouchdownsConcededByTeam',
    'averageCasualtiesCausedByTeam',
    'averageCasualtiesSufferedByTeam',
    'averageSeriousInjuriesCausedByTeam',
    'averageSeriousInjuriesSufferedByTeam',
    'averageLastingInjuriesSufferedByTeam',
    'averageDeathsCausedByTeam',
    'averageDeathsSufferedByTeam',
  ] as const)(
    '%s delegates to TeamAverageStatisticsService and returns its result',
    async (method) => {
      const rows = [{ teamId: 1, name: '40 grinders', average: 2.5 }];
      averages[method].mockResolvedValue(rows);

      await expect(
        service[method]({ leagueId: 9 }, 'asc', 21),
      ).resolves.toEqual(rows);
      expect(averages[method]).toHaveBeenCalledWith({ leagueId: 9 }, 'asc', 21);
    },
  );
});

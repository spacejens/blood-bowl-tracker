import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { TeamRaceCoachNamesService } from '../shared/team-race-coach-names.service';
import { TeamsService } from './teams.service';
import { TeamsStatisticsService } from './teams-statistics.service';

describe('TeamsService toplist delegation (suffered consequences & expensive mistakes)', () => {
  let service: TeamsService;
  let likePattern: MockProxy<LikePatternService>;
  let statistics: MockProxy<TeamsStatisticsService>;
  let teamRaceCoachNames: MockProxy<TeamRaceCoachNamesService>;

  async function build(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: TeamsStatisticsService, useValue: statistics },
        { provide: TeamRaceCoachNamesService, useValue: teamRaceCoachNames },
        { provide: DB, useValue: mock<Db>() },
      ],
    }).compile();
    service = moduleRef.get(TeamsService);
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    statistics = mock<TeamsStatisticsService>();
    teamRaceCoachNames = mock<TeamRaceCoachNamesService>();
  });

  it.each([
    'countCasualtiesSufferedByTeam',
    'countSeriousInjuriesSufferedByTeam',
    'countLastingInjuriesSufferedByTeam',
    'countDeathsSufferedByTeam',
    'sumExpensiveMistakesByTeam',
  ] as const)(
    '%s delegates to TeamsStatisticsService and returns its result',
    async (method) => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 6 }];
      statistics[method].mockResolvedValue(rows);
      await build();

      await expect(service[method](FACT_SCOPE_ALL_TIME, 21)).resolves.toEqual(
        rows,
      );

      expect(statistics[method]).toHaveBeenCalledWith(FACT_SCOPE_ALL_TIME, 21);
    },
  );

  it('listBiggestExpensiveMistakes delegates to TeamsStatisticsService and returns its result', async () => {
    const rows = [
      {
        teamId: 1,
        name: '40 grinders',
        count: 90000,
        date: '2026-03-04',
        category: 'normal' as const,
      },
    ];
    statistics.listBiggestExpensiveMistakes.mockResolvedValue(rows);
    await build();

    await expect(
      service.listBiggestExpensiveMistakes(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);

    expect(statistics.listBiggestExpensiveMistakes).toHaveBeenCalledWith(
      FACT_SCOPE_ALL_TIME,
      21,
    );
  });
});

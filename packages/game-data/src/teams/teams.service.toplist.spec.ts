import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { TeamsService } from './teams.service';
import { TeamsStatisticsService } from './teams-statistics.service';

describe('TeamsService toplist delegation', () => {
  let service: TeamsService;
  let likePattern: MockProxy<LikePatternService>;
  let statistics: MockProxy<TeamsStatisticsService>;

  async function build(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: TeamsStatisticsService, useValue: statistics },
        { provide: DB, useValue: mock<Db>() },
      ],
    }).compile();
    service = moduleRef.get(TeamsService);
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    statistics = mock<TeamsStatisticsService>();
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

  it('countErasByTeam delegates to TeamsStatisticsService and returns its result', async () => {
    const rows = [{ teamId: 1, name: '40 grinders', count: 3 }];
    statistics.countErasByTeam.mockResolvedValue(rows);
    await build();

    await expect(service.countErasByTeam(21)).resolves.toEqual(rows);

    expect(statistics.countErasByTeam).toHaveBeenCalledWith(21);
  });
});

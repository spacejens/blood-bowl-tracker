import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
import {
  CASUALTY_SUFFERED_TYPES,
  DEATH_SUFFERED_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
} from '../shared/match-event-types';
import { MatchOutcomeCountsService } from '../shared/match-outcome-counts.service';
import { TeamsStatisticsService } from './teams-statistics.service';

describe('TeamsStatisticsService (suffered consequences & expensive mistakes)', () => {
  let service: TeamsStatisticsService;
  let matchEventCounts: MockProxy<MatchEventCountsService>;
  let matchOutcomeCounts: MockProxy<MatchOutcomeCountsService>;

  async function build(): Promise<void> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsStatisticsService,
        { provide: MatchEventCountsService, useValue: matchEventCounts },
        { provide: MatchOutcomeCountsService, useValue: matchOutcomeCounts },
        { provide: DB, useValue: mock<Db>() },
      ],
    }).compile();
    service = moduleRef.get(TeamsStatisticsService);
  }

  beforeEach(() => {
    matchEventCounts = mock<MatchEventCountsService>();
    matchOutcomeCounts = mock<MatchOutcomeCountsService>();
  });

  describe('toplist queries', () => {
    it.each([
      ['countCasualtiesSufferedByTeam', 'consequence', CASUALTY_SUFFERED_TYPES],
      [
        'countSeriousInjuriesSufferedByTeam',
        'consequence',
        SERIOUS_INJURY_SUFFERED_TYPES,
      ],
      [
        'countLastingInjuriesSufferedByTeam',
        'consequence',
        LASTING_INJURY_SUFFERED_TYPES,
      ],
      ['countDeathsSufferedByTeam', 'consequence', DEATH_SUFFERED_TYPES],
    ] as const)(
      '%s asks MatchEventCountsService for its own selector and returns the rows',
      async (method, role, types) => {
        const rows = [{ teamId: 1, name: '40 grinders', count: 18 }];
        matchEventCounts.countMatchEventsByTeam.mockResolvedValue(rows);
        await build();

        await expect(service[method](FACT_SCOPE_ALL_TIME, 21)).resolves.toEqual(
          rows,
        );

        expect(matchEventCounts.countMatchEventsByTeam).toHaveBeenCalledWith({
          selector: { role, types },
          scope: FACT_SCOPE_ALL_TIME,
          limit: 21,
        });
      },
    );

    it('sumExpensiveMistakesByTeam forwards the scope and limit and returns the resolved rows', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 150000 },
        { teamId: 2, name: 'Reikland Reavers', count: 40000 },
      ];
      matchEventCounts.sumExpensiveMistakesByTeam.mockResolvedValue(rows);
      await build();

      await expect(
        service.sumExpensiveMistakesByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);

      expect(matchEventCounts.sumExpensiveMistakesByTeam).toHaveBeenCalledWith({
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
    });

    it('listBiggestExpensiveMistakes forwards the scope and limit and returns the resolved rows', async () => {
      const rows = [
        {
          teamId: 1,
          name: '40 grinders',
          count: 90000,
          date: '2026-03-04',
          category: 'normal' as const,
        },
        {
          teamId: 2,
          name: 'Gouged Eye',
          count: 60000,
          date: '2026-02-01',
          category: 'normal' as const,
        },
      ];
      matchEventCounts.listBiggestExpensiveMistakes.mockResolvedValue(rows);
      await build();

      await expect(
        service.listBiggestExpensiveMistakes(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);

      expect(
        matchEventCounts.listBiggestExpensiveMistakes,
      ).toHaveBeenCalledWith({ scope: FACT_SCOPE_ALL_TIME, limit: 21 });
    });
  });
});

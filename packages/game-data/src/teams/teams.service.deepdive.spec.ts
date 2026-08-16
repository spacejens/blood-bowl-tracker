import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TeamsService } from './teams.service';
import { TeamsStatisticsService } from './teams-statistics.service';

describe('TeamsService lookups', () => {
  let service: TeamsService;
  let likePattern: MockProxy<LikePatternService>;
  let statistics: MockProxy<TeamsStatisticsService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: TeamsStatisticsService, useValue: statistics },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TeamsService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    statistics = mock<TeamsStatisticsService>();
  });

  describe('searchByNamePrefix', () => {
    it('returns id/name choices for a name prefix, capped to the limit', async () => {
      const rows = [
        { id: 1, name: '40 grinders' },
        { id: 2, name: '4th Down Doom' },
      ];
      likePattern.escape.mockReturnValue('4');
      const { chains } = await build(rows);
      await expect(service.searchByNamePrefix('4', 25)).resolves.toEqual(rows);
      expect(chains[0].limit).toHaveBeenCalledWith(25);
    });
  });

  describe('findById', () => {
    it('returns the team with its race and coach names and ids', async () => {
      const row = {
        id: 7,
        name: '40 grinders',
        raceName: 'Dwarf',
        raceId: 4,
        coachName: 'Roze Madder',
        coachId: 12,
      };
      const { db, chains } = await build([row]);
      await expect(service.findById(7)).resolves.toEqual(row);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['raceId', 'coachId']),
      );
    });

    it('returns undefined when no team matches', async () => {
      const { chains } = await build([]);
      await expect(service.findById(999)).resolves.toBeUndefined();
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(999);
    });
  });

  describe('listEras', () => {
    it('returns the id/name rows the query resolves to', async () => {
      const rows = [
        { id: 3, name: 'BB2016' },
        { id: 4, name: 'BB2020' },
      ];
      await build(rows);
      await expect(service.listEras(7)).resolves.toEqual(rows);
    });

    it('returns an empty array when the team is linked to no eras', async () => {
      await build([]);
      await expect(service.listEras(7)).resolves.toEqual([]);
    });

    it('filters by the requested team id', async () => {
      const { chains } = await build([]);

      await service.listEras(7);

      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('joins team_eras to eras and orders chronologically by start date, then name', async () => {
      const rows = [
        { id: 4, name: 'BB2020' },
        { id: 3, name: 'BB2016' },
      ];
      const { chains } = await build(rows);

      await service.listEras(7);

      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['eras.start_date'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['eras.name'],
      );
    });
  });

  describe('getCareerSpan', () => {
    it('returns the min/max match dates for the team', async () => {
      const { chains } = await build([
        { start: '2021-09-01', end: '2023-06-10' },
      ]);
      await expect(service.getCareerSpan(7)).resolves.toEqual({
        start: '2021-09-01',
        end: '2023-06-10',
      });
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('returns undefined when the team has played no matches', async () => {
      await build([{ start: null, end: null }]);
      await expect(service.getCareerSpan(7)).resolves.toBeUndefined();
    });
  });

  describe('getTopPlayersByMatchEventCount', () => {
    it('delegates to TeamsStatisticsService and returns its result', async () => {
      const rows = [
        { playerId: 1, name: 'Griff', count: 20 },
        { playerId: 2, name: 'Morg', count: 11 },
      ];
      statistics.getTopPlayersByMatchEventCount.mockResolvedValue(rows);
      await build();

      await expect(
        service.getTopPlayersByMatchEventCount(7, 10),
      ).resolves.toEqual(rows);

      expect(statistics.getTopPlayersByMatchEventCount).toHaveBeenCalledWith(
        7,
        10,
      );
    });
  });

  describe('getRaceAndCoachNamesByIds', () => {
    it('returns race and coach names keyed by team id', async () => {
      const { chains } = await build([
        { teamId: 1, raceName: 'Orc', coachName: 'Skarsnik' },
      ]);
      const names = await service.getRaceAndCoachNamesByIds([1]);
      expect(names.get(1)).toEqual({
        raceName: 'Orc',
        coachName: 'Skarsnik',
      });
      expect(extractFilterValues(firstCallArg(chains[0].where))).toEqual([1]);
    });

    it('returns an empty map for an empty id list', async () => {
      const { db } = await build([]);
      const names = await service.getRaceAndCoachNamesByIds([]);
      expect(names.size).toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });
  });
});

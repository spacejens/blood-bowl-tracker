import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { TeamsQueriesService } from './teams-queries.service';

describe('TeamsQueriesService', () => {
  let service: TeamsQueriesService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsQueriesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TeamsQueriesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
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

    it('converts the min/max match timestamps to UTC calendar days', async () => {
      const { db } = await build([{ start: '2021-09-01', end: '2023-06-10' }]);
      await service.getCareerSpan(7);
      const fields = firstCallArg(db.select) as {
        start: unknown;
        end: unknown;
      };
      expect(sqlText(fields.start)).toContain('(min(');
      expect(sqlText(fields.start)).toContain(") at time zone 'UTC')::date");
      expect(sqlText(fields.end)).toContain('(max(');
      expect(sqlText(fields.end)).toContain(") at time zone 'UTC')::date");
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { db } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByEra', () => {
    it('returns the distinct team count for the era', async () => {
      const { db, chains } = await build([{ count: 12 }]);
      await expect(service.countByEra(5)).resolves.toBe(12);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    it('returns the distinct team count for the league', async () => {
      const { db, chains } = await build([{ count: 20 }]);
      await expect(service.countByLeague(9)).resolves.toBe(20);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    it('returns the distinct team count for the competition', async () => {
      const { db, chains } = await build([{ count: 9 }]);
      await expect(service.countByCompetition(7)).resolves.toBe(9);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'competition_teams.team_era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });
});

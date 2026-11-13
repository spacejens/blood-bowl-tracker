import type { Db } from '@blood-bowl-tracker/db';
import {
  competitions,
  DB,
  getColumnTable,
  getTableName,
  leagues,
} from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  Column,
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  is,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { CompetitionsQueriesService } from './competitions-queries.service';

describe('CompetitionsQueriesService', () => {
  let service: CompetitionsQueriesService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionsQueriesService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CompetitionsQueriesService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { chains } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(chains[0].from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByType', () => {
    it('countByType filters competitions by the given type', async () => {
      const { chains } = await build([{ count: 4 }]);
      await expect(service.countByType('season')).resolves.toBe(4);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe('season');
    });
  });

  describe('countByEra', () => {
    it('returns the competition count for the era', async () => {
      const { db, chains } = await build([{ count: 4 }]);
      await expect(service.countByEra(5)).resolves.toBe(4);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('countByType with era', () => {
    it('filters by era when an eraId is given', async () => {
      const { chains } = await build([{ count: 2 }]);
      await expect(service.countByType('season', 5)).resolves.toBe(2);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'season',
        5,
      ]);
    });
  });

  describe('countByLeague', () => {
    it('returns the competition count for the league', async () => {
      const { chains } = await build([{ count: 9 }]);
      await expect(service.countByLeague(9)).resolves.toBe(9);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'competitions.era_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('countByType with league', () => {
    it('filters by league when a leagueId is given', async () => {
      const { chains } = await build([{ count: 3 }]);
      await expect(service.countByType('season', undefined, 9)).resolves.toBe(
        3,
      );
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'competitions.era_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        'season',
        9,
      ]);
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns competitions joined to their league name with their date span, capped at the limit', async () => {
      const rows = [
        {
          id: 7,
          name: 'Major Season 24',
          leagueName: 'The Major',
          startDate: '2024-01-15',
          endDate: '2024-06-30',
        },
      ];
      likePattern.escape.mockReturnValue('Maj');
      const { db, chains } = await build(rows);
      await expect(service.searchByNamePrefix('Maj', 25)).resolves.toEqual(
        rows,
      );
      expect(chains[0].limit).toHaveBeenCalledWith(25);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'competitions.era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['leagues.id', 'eras.league_id']);
      expect(firstCallArg(db.select)).toEqual({
        id: competitions.id,
        name: competitions.name,
        leagueName: leagues.name,
        startDate: competitions.startDate,
        endDate: competitions.endDate,
      });
    });

    it('escapes LIKE metacharacters in the prefix', async () => {
      likePattern.escape.mockReturnValue('50\\%\\_x');
      const { chains } = await build([]);
      await service.searchByNamePrefix('50%_x', 10);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      // ilike() (unlike eq()/inArray()) embeds its pattern as a raw string
      // chunk rather than a Param, so extractFilterValues (which only reads
      // Param chunks) can't reach it; read the raw string chunk directly.
      const condition = firstCallArg(chains[0].where) as {
        queryChunks: unknown[];
      };
      const pattern = condition.queryChunks.find(
        (chunk): chunk is string => typeof chunk === 'string',
      );
      expect(pattern).toBe('50\\%\\_x%');
    });
  });

  describe('listByEraChronological', () => {
    it('returns the era competitions the query resolves to', async () => {
      const rows = [
        {
          id: 1,
          name: 'Season 1',
          type: 'season' as const,
          startDate: '2024-01-15',
          endDate: '2024-06-30',
        },
        {
          id: 2,
          name: 'Cup A',
          type: 'cup' as const,
          startDate: '2024-07-01',
          endDate: null,
        },
      ];
      const { db, chains } = await build(rows);
      await expect(service.listByEraChronological(5)).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      // filtered to the requested era
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
      // grouped so the min-match-date aggregate is per competition
      expect(chains[0].groupBy).toHaveBeenCalledTimes(1);
      // ordered (earliest-match-date asc, nulls last) — verified as a SQL chunk
      expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
      // left join keeps competitions that have no matches yet
      expect(chains[0].leftJoin).toHaveBeenCalledTimes(1);
    });

    it('selects the competition dates so callers can render a duration', async () => {
      const { db } = await build([]);
      await service.listByEraChronological(5);
      expect(Object.keys(firstCallArg(db.select) as object)).toEqual([
        'id',
        'name',
        'type',
        'startDate',
        'endDate',
      ]);
    });

    it('returns an empty array when the era has no competitions', async () => {
      await build([]);
      await expect(service.listByEraChronological(5)).resolves.toEqual([]);
    });
  });

  describe('listByCompetitionGroupChronological', () => {
    it('returns the group competitions the query resolves to', async () => {
      const rows = [
        {
          id: 1,
          name: 'Chaos Cup 23',
          eraId: 20,
          eraName: 'BB2020',
          eraStartDate: '2020-01-01',
          eraEndDate: null,
          startDate: '2023-10-01',
          endDate: '2023-10-02',
        },
        {
          id: 2,
          name: 'Chaos Cup 24',
          eraId: 21,
          eraName: 'BB2020 v2',
          eraStartDate: '2024-01-01',
          eraEndDate: '2024-12-31',
          startDate: '2024-10-01',
          endDate: null,
        },
      ];
      const { db, chains } = await build(rows);

      await expect(
        service.listByCompetitionGroupChronological(4),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
      // filtered to the requested competition group
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(4);
      // grouped so the min-match-date aggregate is per competition
      expect(chains[0].groupBy).toHaveBeenCalledTimes(1);
      // ordered (earliest-match-date asc, nulls last)
      expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
      // left join keeps competitions that have no matches yet
      expect(chains[0].leftJoin).toHaveBeenCalledTimes(1);
      // inner join resolves each competition's era name
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'competitions.era_id']);
    });

    it('selects the era and the dates so callers can render a line per competition', async () => {
      const { db } = await build([]);

      await service.listByCompetitionGroupChronological(4);
      expect(Object.keys(firstCallArg(db.select) as object)).toEqual([
        'id',
        'name',
        'eraId',
        'eraName',
        'eraStartDate',
        'eraEndDate',
        'startDate',
        'endDate',
      ]);
    });

    it('returns an empty array when the group has no competitions', async () => {
      await build([]);

      await expect(
        service.listByCompetitionGroupChronological(4),
      ).resolves.toEqual([]);
    });

    it("orders by the era's own start date before the match-date aggregate, so an unplayed competition cannot split its era's rows apart", async () => {
      const { chains } = await build([]);

      await service.listByCompetitionGroupChronological(4);

      const eraOrderColumn = firstCallArg(chains[0].orderBy, 0, 0);
      expect(is(eraOrderColumn, Column)).toBe(true);
      // `Column` (from `/test-helpers`) and `getColumnTable`'s parameter type
      // (from the main entry) are two structurally-incompatible copies of
      // the same drizzle class — the dual-package split's type-level
      // counterpart to why `is()` replaces `instanceof` above.
      expect(
        getTableName(
          getColumnTable(
            eraOrderColumn as Parameters<typeof getColumnTable>[0],
          ),
        ),
      ).toBe('eras');
      expect((eraOrderColumn as Column).name).toBe('start_date');
    });

    it('breaks ties on equal era start dates by era id, so two eras sharing a start date cannot interleave', async () => {
      const { chains } = await build([]);

      await service.listByCompetitionGroupChronological(4);

      const tiebreakerColumn = firstCallArg(chains[0].orderBy, 0, 1);
      expect(is(tiebreakerColumn, Column)).toBe(true);
      expect(
        getTableName(
          getColumnTable(
            tiebreakerColumn as Parameters<typeof getColumnTable>[0],
          ),
        ),
      ).toBe('eras');
      expect((tiebreakerColumn as Column).name).toBe('id');
    });
  });

  describe('findByIdWithEra', () => {
    it('returns the competition joined with its era name', async () => {
      const row = {
        id: 1,
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        eraName: 'BB2020',
        eraStartDate: '2020-01-01',
        eraEndDate: null,
        competitionGroupId: 4,
        competitionGroupName: 'The Major',
        startDate: '2024-01-15',
        endDate: '2024-06-30',
      };
      await build([row]);
      await expect(service.findByIdWithEra(1)).resolves.toEqual(row);
    });

    it('selects the competition group id/name and dates so the deepdive can link and render a duration', async () => {
      const { db, chains } = await build([]);
      await service.findByIdWithEra(1);
      expect(Object.keys(firstCallArg(db.select) as object)).toEqual([
        'id',
        'name',
        'type',
        'eraId',
        'eraName',
        'eraStartDate',
        'eraEndDate',
        'competitionGroupId',
        'competitionGroupName',
        'startDate',
        'endDate',
      ]);
      // inner join resolves the competition group's name
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['competition_groups.id', 'competitions.competition_group_id']);
    });

    it("selects the era's own date range alongside its name", async () => {
      const { db } = await build([]);

      await service.findByIdWithEra(1);

      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['eraName', 'eraStartDate', 'eraEndDate']),
      );
    });

    it('returns undefined when no competition matches', async () => {
      await build([]);
      await expect(service.findByIdWithEra(999)).resolves.toBeUndefined();
    });
  });

  describe('listTeams', () => {
    it('returns the participating teams (id/name) ordered by name', async () => {
      const rows = [
        { id: 5, name: 'Gouged Eye' },
        { id: 9, name: 'Reikland Reavers' },
      ];
      const { chains } = await build(rows);
      await expect(service.listTeams(3)).resolves.toEqual(rows);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(3);
    });

    it('returns an empty array when no teams participated', async () => {
      await build([]);
      await expect(service.listTeams(3)).resolves.toEqual([]);
    });
  });

  describe('listAllWithEraId', () => {
    it('returns every competition with its era id and date range', async () => {
      await build([
        {
          id: 1,
          name: 'Season 1',
          eraId: 10,
          startDate: '2024-01-15',
          endDate: '2024-06-30',
        },
        {
          id: 2,
          name: 'Cup 1',
          eraId: 11,
          startDate: '2024-07-01',
          endDate: null,
        },
      ]);

      const result = await service.listAllWithEraId();

      expect(result).toEqual([
        {
          id: 1,
          name: 'Season 1',
          eraId: 10,
          startDate: '2024-01-15',
          endDate: '2024-06-30',
        },
        {
          id: 2,
          name: 'Cup 1',
          eraId: 11,
          startDate: '2024-07-01',
          endDate: null,
        },
      ]);
    });

    it('returns an empty list when there are no competitions', async () => {
      await build([]);
      expect(await service.listAllWithEraId()).toEqual([]);
    });

    it('selects the date range alongside id/name/eraId', async () => {
      const { db } = await build([]);

      await service.listAllWithEraId();

      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['startDate', 'endDate']),
      );
    });
  });
});

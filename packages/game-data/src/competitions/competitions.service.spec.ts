import type { Db } from '@blood-bowl-tracker/db';
import { competitions, competitionTeams, DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { Column, getColumnTable, getTableName, is } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { LikePatternService } from '../shared/like-pattern.service';
import { MissingRequiredFieldError } from '../shared/missing-required-field-error';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import {
  CompetitionsService,
  CompetitionUpsertConflictError,
} from './competitions.service';

const fakeCompetition = {
  id: 1,
  name: 'Major Season 24',
  type: 'season',
  eraId: 20,
  createdAt: new Date('2026-01-01'),
};

describe('CompetitionsService', () => {
  let service: CompetitionsService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionsService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CompetitionsService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  const baseData = {
    name: 'Major Season 24',
    type: 'season' as const,
    eraId: 20,
    teamEraIds: [100, 101],
    startDate: '2024-01-15',
    endDate: '2024-06-30',
    externalIds: [
      { externalSystemId: 1, externalId: '73' },
      { externalSystemId: 2, externalId: 'Major Season 24' },
    ],
  };

  // competitions.competition_group_id is NOT NULL with no database default,
  // so every create-path payload has to carry one; baseData deliberately
  // omits it so the update-path tests keep asserting on the columns they
  // actually exercise.
  const createData = { ...baseData, competitionGroupId: 3 };

  describe('upsert', () => {
    it('creates a new competition with its team-era links when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: both external IDs are new and get
      // inserted; query 3: no existing team-era links; query 4: both
      // team-era links are new and get inserted.
      const { db, chains } = await build([], [fakeCompetition]);

      const result = await service.upsert(createData);

      expect(result).toEqual({
        competition: { ...fakeCompetition, teamEraIds: [100, 101] },
        created: true,
      });
      expect(chains).toHaveLength(5);
      expect(db.insert).toHaveBeenCalledWith(competitions);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts the competition with its name, type, eraId and both dates', async () => {
      const { chains } = await build([], [fakeCompetition]);

      await service.upsert(createData);

      expect(firstCallArg(chains[1].values)).toEqual({
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        startDate: '2024-01-15',
        endDate: '2024-06-30',
        competitionGroupId: 3,
      });
    });

    it('omits endDate from the insert when the payload omits it', async () => {
      const { chains } = await build([], [fakeCompetition]);

      await service.upsert({ ...createData, endDate: undefined });

      expect(firstCallArg(chains[1].values)).toStrictEqual({
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        startDate: '2024-01-15',
        competitionGroupId: 3,
      });
    });

    it('throws MissingRequiredFieldError when creating a competition with no startDate', async () => {
      const { db } = await build([]);

      await expect(
        service.upsert({ ...createData, startDate: undefined }),
      ).rejects.toThrow(MissingRequiredFieldError);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('throws MissingRequiredFieldError when creating a competition with no competitionGroupId', async () => {
      const { db } = await build([]);

      await expect(service.upsert(baseData)).rejects.toThrow(
        MissingRequiredFieldError,
      );
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('leaves stored dates alone on update when the payload omits them', async () => {
      // query 0: the external-id lookup matches competition 1; query 1: the
      // update.
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '73' }],
        [fakeCompetition],
      );

      await service.upsert({
        ...baseData,
        startDate: undefined,
        endDate: undefined,
      });

      expect(firstCallArg(chains[1].set)).toStrictEqual({
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
      });
    });

    it('writes null on update when the payload explicitly clears endDate', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '73' }],
        [fakeCompetition],
      );

      await service.upsert({ ...baseData, endDate: null });

      expect(firstCallArg(chains[1].set)).toMatchObject({ endDate: null });
    });

    it('updates the matching competition when exactly one external ID matches', async () => {
      const { db } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '73' }],
        [fakeCompetition],
      );

      const result = await service.upsert(baseData);

      expect(result.created).toBe(false);
      expect(db.update).toHaveBeenCalledWith(competitions);
    });

    it('throws CompetitionUpsertConflictError when external IDs match different competitions', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: '73' },
        { ownerId: 2, externalSystemId: 2, externalId: 'Major Season 24' },
      ]);

      await expect(service.upsert(baseData)).rejects.toThrow(
        CompetitionUpsertConflictError,
      );
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts only the competition_teams rows that are new', async () => {
      const { chains } = await build(
        [],
        [fakeCompetition],
        [],
        [{ teamEraId: 100 }],
      );

      const result = await service.upsert(createData);

      expect(firstCallArg(chains[4].values)).toEqual([
        { competitionId: 1, teamEraId: 101 },
      ]);
      expect(result.competition.teamEraIds).toEqual([100, 101]);
    });

    it('does not insert competition_teams rows when all links already exist', async () => {
      const { db, chains } = await build(
        [],
        [fakeCompetition],
        [],
        [{ teamEraId: 100 }, { teamEraId: 101 }],
      );

      const result = await service.upsert(createData);

      expect(chains).toHaveLength(4);
      expect(db.insert).not.toHaveBeenCalledWith(competitionTeams);
      expect(result.competition.teamEraIds).toEqual([100, 101]);
    });

    it('writes competitionGroupId when the payload supplies one', async () => {
      const { chains } = await build([], [fakeCompetition]);

      await service.upsert({ ...baseData, competitionGroupId: 4 });

      expect(firstCallArg(chains[1].values)).toMatchObject({
        competitionGroupId: 4,
      });
    });

    it('updates only the supplied column, leaving eraId and type alone', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '35' }],
        [fakeCompetition],
      );

      await service.upsert({
        name: 'Major Season 12',
        teamEraIds: [],
        externalIds: [{ externalSystemId: 1, externalId: '35' }],
      });

      expect(firstCallArg(chains[1].set)).toEqual({ name: 'Major Season 12' });
    });
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

  describe('findById', () => {
    it('returns the competition row when found', async () => {
      await build([
        { id: 7, name: 'Major Season 24', type: 'season', eraId: 20 },
      ]);
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
      });
    });

    it('returns undefined when no competition matches', async () => {
      await build([]);
      await expect(service.findById(999)).resolves.toBeUndefined();
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns competitions joined to their league name, capped at the limit', async () => {
      const rows = [
        { id: 7, name: 'Major Season 24', leagueName: 'The Major' },
      ];
      likePattern.escape.mockReturnValue('Maj');
      const { chains } = await build(rows);
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
          startDate: '2023-10-01',
          endDate: '2023-10-02',
        },
        {
          id: 2,
          name: 'Chaos Cup 24',
          eraId: 21,
          eraName: 'BB2020 v2',
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
      expect(getTableName(getColumnTable(eraOrderColumn as Column))).toBe(
        'eras',
      );
      expect((eraOrderColumn as Column).name).toBe('start_date');
    });

    it('breaks ties on equal era start dates by era id, so two eras sharing a start date cannot interleave', async () => {
      const { chains } = await build([]);

      await service.listByCompetitionGroupChronological(4);

      const tiebreakerColumn = firstCallArg(chains[0].orderBy, 0, 1);
      expect(is(tiebreakerColumn, Column)).toBe(true);
      expect(getTableName(getColumnTable(tiebreakerColumn as Column))).toBe(
        'eras',
      );
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
    it('returns every competition with its era id', async () => {
      await build([
        { id: 1, name: 'Season 1', eraId: 10 },
        { id: 2, name: 'Cup 1', eraId: 11 },
      ]);

      const result = await service.listAllWithEraId();

      expect(result).toEqual([
        { id: 1, name: 'Season 1', eraId: 10 },
        { id: 2, name: 'Cup 1', eraId: 11 },
      ]);
    });

    it('returns an empty list when there are no competitions', async () => {
      await build([]);
      expect(await service.listAllWithEraId()).toEqual([]);
    });
  });
});

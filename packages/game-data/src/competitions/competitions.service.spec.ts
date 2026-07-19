import type { Db } from '@blood-bowl-tracker/db';
import {
  competitionExternalIds,
  competitions,
  competitionTeams,
  DB,
} from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function makeFromBuilder(rows: unknown[]) {
  return {
    where: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
}

function makeCountBuilder(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const builder = {
    from: vi.fn(() => builder),
    where,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
  return builder;
}

function makeChronoBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.groupBy = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return builder;
}

describe('CompetitionsService', () => {
  let service: CompetitionsService;
  let externalIdRows: unknown[];
  let existingTeamEraRows: { teamEraId: number }[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    existingTeamEraRows = [];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === competitionExternalIds
              ? externalIdRows
              : existingTeamEraRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return { returning: () => Promise.resolve([fakeCompetition]) };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({
              returning: () => Promise.resolve([fakeCompetition]),
            }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [CompetitionsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(CompetitionsService);
  });

  const baseData = {
    name: 'Major Season 24',
    type: 'season' as const,
    eraId: 20,
    teamEraIds: [100, 101],
    externalIds: [
      { externalSystemId: 1, externalId: '73' },
      { externalSystemId: 2, externalId: 'Major Season 24' },
    ],
  };

  it('creates a new competition with its team-era links when no external IDs match', async () => {
    const result = await service.upsert(baseData);

    expect(result).toEqual({
      competition: { ...fakeCompetition, teamEraIds: [100, 101] },
      created: true,
    });
    expect(insertCalls.some((c) => c.table === competitions)).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts the competition with its name, type and eraId', async () => {
    await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === competitions);
    expect(call?.values).toEqual({
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
    });
  });

  it('updates the matching competition when exactly one external ID matches', async () => {
    externalIdRows = [{ ownerId: 1, externalSystemId: 1, externalId: '73' }];

    const result = await service.upsert(baseData);

    expect(result.created).toBe(false);
    expect(updateCalls.some((c) => c.table === competitions)).toBe(true);
  });

  it('throws CompetitionUpsertConflictError when external IDs match different competitions', async () => {
    externalIdRows = [
      { ownerId: 1, externalSystemId: 1, externalId: '73' },
      { ownerId: 2, externalSystemId: 2, externalId: 'Major Season 24' },
    ];

    await expect(service.upsert(baseData)).rejects.toThrow(
      CompetitionUpsertConflictError,
    );
    expect(insertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('inserts only the competition_teams rows that are new', async () => {
    existingTeamEraRows = [{ teamEraId: 100 }];

    const result = await service.upsert(baseData);

    const call = insertCalls.find((c) => c.table === competitionTeams);
    expect(call?.values).toEqual([{ competitionId: 1, teamEraId: 101 }]);
    expect(result.competition.teamEraIds).toEqual([100, 101]);
  });

  it('does not insert competition_teams rows when all links already exist', async () => {
    existingTeamEraRows = [{ teamEraId: 100 }, { teamEraId: 101 }];

    const result = await service.upsert(baseData);

    expect(insertCalls.some((c) => c.table === competitionTeams)).toBe(false);
    expect(result.competition.teamEraIds).toEqual([100, 101]);
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new CompetitionsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByType', () => {
    it('countByType filters competitions by the given type', async () => {
      const where = vi.fn().mockResolvedValue([{ count: 4 }]);
      const from = vi.fn(() => ({ where }));
      const service = new CompetitionsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countByType('season')).resolves.toBe(4);
      expect(where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(where))).toBe('season');
    });
  });

  describe('countByEra', () => {
    it('returns the competition count for the era', async () => {
      const builder = makeCountBuilder([{ count: 4 }]);
      const select = vi.fn(() => builder);
      const service = new CompetitionsService({ select } as unknown as Db);
      await expect(service.countByEra(5)).resolves.toBe(4);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(5);
    });
  });

  describe('countByType with era', () => {
    it('filters by era when an eraId is given', async () => {
      const builder = makeCountBuilder([{ count: 2 }]);
      const select = vi.fn(() => builder);
      const service = new CompetitionsService({ select } as unknown as Db);
      await expect(service.countByType('season', 5)).resolves.toBe(2);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'season',
        5,
      ]);
    });
  });

  describe('findById', () => {
    it('returns the competition row when found', async () => {
      const where = vi
        .fn()
        .mockResolvedValue([
          { id: 7, name: 'Major Season 24', type: 'season', eraId: 20 },
        ]);
      const from = vi.fn(() => ({ where }));
      const service = new CompetitionsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
      });
    });

    it('returns undefined when no competition matches', async () => {
      const where = vi.fn().mockResolvedValue([]);
      const from = vi.fn(() => ({ where }));
      const service = new CompetitionsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.findById(999)).resolves.toBeUndefined();
    });
  });

  describe('searchByNamePrefix', () => {
    function makeJoinBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => builder);
      builder.limit = vi.fn(() => Promise.resolve(rows));
      return builder;
    }

    it('returns competitions joined to their league name, capped at the limit', async () => {
      const rows = [
        { id: 7, name: 'Major Season 24', leagueName: 'The Major' },
      ];
      const builder = makeJoinBuilder(rows);
      const service = new CompetitionsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await expect(service.searchByNamePrefix('Maj', 25)).resolves.toEqual(
        rows,
      );
      expect(builder.limit).toHaveBeenCalledWith(25);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['eras.id', 'competitions.era_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['leagues.id', 'eras.league_id'],
      );
    });

    it('escapes LIKE metacharacters in the prefix', async () => {
      const builder = makeJoinBuilder([]);
      const service = new CompetitionsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.searchByNamePrefix('50%_x', 10);
      expect(builder.where).toHaveBeenCalledTimes(1);
      // ilike() (unlike eq()/inArray()) embeds its pattern as a raw string
      // chunk rather than a Param, so extractFilterValues (which only reads
      // Param chunks) can't reach it; read the raw string chunk directly.
      const condition = firstCallArg(builder.where) as {
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
        { id: 1, name: 'Season 1', type: 'season' as const },
        { id: 2, name: 'Cup A', type: 'cup' as const },
      ];
      const builder = makeChronoBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new CompetitionsService({ select } as unknown as Db);
      await expect(service.listByEraChronological(5)).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
      // filtered to the requested era
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(5);
      // grouped so the min-match-date aggregate is per competition
      expect(builder.groupBy).toHaveBeenCalledTimes(1);
      // ordered (earliest-match-date asc, nulls last) — verified as a SQL chunk
      expect(builder.orderBy).toHaveBeenCalledTimes(1);
      // left join keeps competitions that have no matches yet
      expect(builder.leftJoin).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when the era has no competitions', async () => {
      const builder = makeChronoBuilder([]);
      const service = new CompetitionsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await expect(service.listByEraChronological(5)).resolves.toEqual([]);
    });
  });
});

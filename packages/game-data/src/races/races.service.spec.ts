import type { Db } from '@blood-bowl-tracker/db';
import { DB, raceEras, raceExternalIds, races } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { is, SQL, StringChunk } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { RacesService, RaceUpsertConflictError } from './races.service';

/**
 * True when a captured aggregate expression is `countDistinct(...)` rather
 * than plain `count(...)`. drizzle-orm renders `countDistinct` as
 * `sql`count(distinct ${expr})`` — its first query chunk is a `StringChunk`
 * whose text starts with "count(distinct ", vs. "count(" for plain `count`.
 * Used to guard against double-counting when a join can legitimately produce
 * more than one row per grouped entity (e.g. a team with `teamEras` rows in
 * two eras of the same league).
 */
function isCountDistinct(expr: unknown): boolean {
  if (!is(expr, SQL)) return false;
  const first = expr.queryChunks[0];
  return is(first, StringChunk) && first.value.join('').includes('distinct');
}

function makeQueryBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.groupBy = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return builder;
}

const fakeRace = {
  id: 1,
  name: 'Orc',
  createdAt: new Date('2026-01-01'),
};

function makeCountBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return builder;
}

function makeFromBuilder(rows: unknown[]) {
  return {
    where: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
}

describe('RacesService', () => {
  const likePattern = new LikePatternService();
  let service: RacesService;
  let externalIdRows: unknown[];
  let existingEraRows: { eraId: number }[];
  let insertCalls: { table: unknown; values: unknown }[];
  let updateCalls: { table: unknown; set: unknown }[];

  beforeEach(async () => {
    externalIdRows = [];
    existingEraRows = [];
    insertCalls = [];
    updateCalls = [];

    const mockDb = {
      select: () => ({
        from: (table: unknown) =>
          makeFromBuilder(
            table === raceExternalIds ? externalIdRows : existingEraRows,
          ),
      }),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return { returning: () => Promise.resolve([fakeRace]) };
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updateCalls.push({ table, set });
          return {
            where: () => ({ returning: () => Promise.resolve([fakeRace]) }),
          };
        },
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        RacesService,
        LikePatternService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get(RacesService);
  });

  describe('upsert', () => {
    const baseData = {
      name: 'Orc',
      eras: [5, 6],
      externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
    };

    it('creates a new race with its eras when no external IDs match', async () => {
      const result = await service.upsert(baseData);
      expect(result).toEqual({
        race: { ...fakeRace, eras: [5, 6] },
        created: true,
      });
      expect(updateCalls).toHaveLength(0);
    });

    it('defaults to no era links when eras is empty', async () => {
      const result = await service.upsert({
        name: 'Orc',
        eras: [],
        externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
      });
      expect(result.race.eras).toEqual([]);
      expect(insertCalls.some((c) => c.table === raceEras)).toBe(false);
    });

    it('inserts only the race_eras rows that are new', async () => {
      existingEraRows = [{ eraId: 5 }];
      const result = await service.upsert(baseData);
      const call = insertCalls.find((c) => c.table === raceEras);
      expect(call?.values).toEqual([{ raceId: 1, eraId: 6 }]);
      expect(result.race.eras).toEqual([5, 6]);
    });

    it('does not insert race_eras rows when all links already exist', async () => {
      existingEraRows = [{ eraId: 5 }, { eraId: 6 }];
      const result = await service.upsert(baseData);
      expect(insertCalls.some((c) => c.table === raceEras)).toBe(false);
      expect(result.race.eras).toEqual([5, 6]);
    });

    it('updates the matching race when exactly one external ID matches', async () => {
      externalIdRows = [{ ownerId: 1, externalSystemId: 1, externalId: 'Orc' }];
      const result = await service.upsert(baseData);
      expect(result.created).toBe(false);
      expect(updateCalls.some((c) => c.table === races)).toBe(true);
    });

    it('throws RaceUpsertConflictError when external IDs match different races', async () => {
      externalIdRows = [
        { ownerId: 1, externalSystemId: 1, externalId: 'Orc' },
        { ownerId: 2, externalSystemId: 2, externalId: 'Orc' },
      ];
      await expect(service.upsert(baseData)).rejects.toThrow(
        RaceUpsertConflictError,
      );
      expect(insertCalls).toHaveLength(0);
      expect(updateCalls).toHaveLength(0);
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new RacesService(
        {
          select: vi.fn(() => ({ from })),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe('toplist queries', () => {
    it('countTeamsByRace returns the rows the query resolves to', async () => {
      const rows = [
        { raceId: 1, name: 'Orc', count: 12 },
        { raceId: 2, name: 'Skaven', count: 7 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countTeamsByRace(FACT_SCOPE_ALL_TIME),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
      const selectedFields = firstCallArg(select, 0, 0) as { count: unknown };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });

    it('countTeamsByRace returns an empty array when there is no data', async () => {
      const select = vi.fn(() => makeQueryBuilder([]));
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countTeamsByRace(FACT_SCOPE_ALL_TIME),
      ).resolves.toEqual([]);
    });

    it('countTeamsByRace joins team_eras when an eraId is given', async () => {
      const rows = [{ raceId: 1, name: 'Orc', count: 3 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countTeamsByRace({ eraId: 20 })).resolves.toEqual(
        rows,
      );
      // Era path adds a second innerJoin (teams + teamEras) vs. one when unfiltered.
      expect(builder.innerJoin).toHaveBeenCalledTimes(2);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['teams.race_id', 'races.id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['team_eras.team_id', 'teams.id', 'team_eras.era_id'],
      );
    });

    it('countMatchesPlayedByRace returns the rows the query resolves to', async () => {
      const rows = [
        { raceId: 1, name: 'Orc', count: 40 },
        { raceId: 2, name: 'Skaven', count: 18 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countMatchesPlayedByRace(FACT_SCOPE_ALL_TIME),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countMatchesPlayedByRace filters by era when an eraId is given', async () => {
      const rows = [{ raceId: 1, name: 'Orc', count: 6 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countMatchesPlayedByRace({ eraId: 20 }),
      ).resolves.toEqual(rows);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(20);
    });
  });

  describe('league scoping', () => {
    it('countMatchesPlayedByRace filters by league via the eras join', async () => {
      const builder = makeQueryBuilder([]);
      const service = new RacesService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await service.countMatchesPlayedByRace({ leagueId: 9 });
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['eras.id', 'team_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });

    it('countTeamsByRace counts teams of the race active in an era of the league', async () => {
      const rows = [{ raceId: 1, name: 'Orc', count: 2 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countTeamsByRace({ leagueId: 9 })).resolves.toEqual(
        rows,
      );
      // League path adds two innerJoins (teams + teamEras + eras) vs. one unfiltered.
      expect(builder.innerJoin).toHaveBeenCalledTimes(3);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 2, 1))).toEqual(
        ['eras.id', 'team_eras.era_id', 'eras.league_id'],
      );
    });

    it('countTeamsByRace does not double-count a team with teamEras rows in two eras of the same league', async () => {
      // The league scope joins teamEras unfiltered by era, then filters by
      // eras.leagueId. A team with separate teamEras rows in two different
      // eras of the *same* league (no unique constraint on teamId alone)
      // would join to two rows and be counted twice unless the aggregate
      // uses DISTINCT on teams.id.
      const rows = [{ raceId: 1, name: 'Orc', count: 1 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countTeamsByRace({ leagueId: 9 })).resolves.toEqual(
        rows,
      );
      const selectedFields = firstCallArg(select, 0, 0) as { count: unknown };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });
  });

  describe('countByEra', () => {
    it('returns the distinct race count for the era', async () => {
      const builder = makeCountBuilder([{ count: 8 }]);
      const select = vi.fn(() => builder);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countByEra(5)).resolves.toBe(8);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    it('returns the distinct race count for the league', async () => {
      const builder = makeCountBuilder([{ count: 12 }]);
      const select = vi.fn(() => builder);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countByLeague(9)).resolves.toBe(12);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['eras.id', 'race_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    it('returns the distinct race count for the competition', async () => {
      const builder = makeCountBuilder([{ count: 5 }]);
      const select = vi.fn(() => builder);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countByCompetition(7)).resolves.toBe(5);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['team_eras.id', 'competition_teams.team_era_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['teams.id', 'team_eras.team_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    });
  });

  describe('findById', () => {
    it('returns the race row when it exists', async () => {
      const rows = [{ id: 1, name: 'Orc' }];
      const where = vi.fn().mockResolvedValue(rows);
      const select = vi.fn(() => ({ from: () => ({ where }) }));
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.findById(1)).resolves.toEqual({
        id: 1,
        name: 'Orc',
      });
    });

    it('returns undefined when no race matches', async () => {
      const where = vi.fn().mockResolvedValue([]);
      const select = vi.fn(() => ({ from: () => ({ where }) }));
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.findById(999)).resolves.toBeUndefined();
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns id/name rows matching the prefix and forwards the limit', async () => {
      const rows = [{ id: 1, name: 'Orc' }];
      const limit = vi.fn().mockResolvedValue(rows);
      const where = vi.fn(() => ({ limit }));
      const select = vi.fn(() => ({ from: () => ({ where }) }));
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.searchByNamePrefix('or', 25)).resolves.toEqual(rows);
      expect(limit).toHaveBeenCalledWith(25);
    });

    it('returns an empty array when nothing matches the prefix', async () => {
      const limit = vi.fn().mockResolvedValue([]);
      const where = vi.fn(() => ({ limit }));
      const select = vi.fn(() => ({ from: () => ({ where }) }));
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.searchByNamePrefix('zz', 25)).resolves.toEqual([]);
    });
  });

  describe('listEras', () => {
    function makeChain(rows: unknown[]) {
      const orderBy = vi.fn().mockResolvedValue(rows);
      const where = vi.fn(() => ({ orderBy }));
      const innerJoin = vi.fn(() => ({ where }));
      const from = vi.fn(() => ({ innerJoin }));
      return { select: vi.fn(() => ({ from })), orderBy, where, innerJoin };
    }

    it('returns the id/name rows the query resolves to', async () => {
      const { select } = makeChain([
        { id: 3, name: 'BB2016' },
        { id: 4, name: 'BB2020' },
      ]);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.listEras(1)).resolves.toEqual([
        { id: 3, name: 'BB2016' },
        { id: 4, name: 'BB2020' },
      ]);
    });

    it('returns an empty array when the race is linked to no eras', async () => {
      const { select } = makeChain([]);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.listEras(1)).resolves.toEqual([]);
    });
  });

  describe('getTopTeamsByMatchesPlayed', () => {
    function makeChain(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => builder);
      builder.groupBy = vi.fn(() => builder);
      builder.orderBy = vi.fn(() => builder);
      builder.limit = vi.fn(() => Promise.resolve(rows));
      return builder;
    }

    it('returns the team rows (with id) and forwards the limit', async () => {
      const rows = [{ id: 9, name: 'Reikland Reavers', count: 12 }];
      const builder = makeChain(rows);
      const select = vi.fn(() => builder);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.getTopTeamsByMatchesPlayed(1, 10)).resolves.toEqual(
        rows,
      );
      const selectArg = (select as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      expect(Object.keys(selectArg)).toContain('id');
      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it('returns an empty array when the race has no matches', async () => {
      const builder = makeChain([]);
      const select = vi.fn(() => builder);
      const service = new RacesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.getTopTeamsByMatchesPlayed(1, 10)).resolves.toEqual(
        [],
      );
    });
  });
});

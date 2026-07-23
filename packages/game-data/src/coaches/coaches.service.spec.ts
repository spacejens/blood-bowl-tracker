import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
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
import { CoachesService, CoachUpsertConflictError } from './coaches.service';

const fakeCoach = {
  id: 1,
  name: 'Roze Madder',
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

describe('CoachesService', () => {
  const likePattern = new LikePatternService();
  let service: CoachesService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeCoach])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeCoach]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakeCoach]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [
        CoachesService,
        LikePatternService,
        { provide: DB, useValue: mockDb },
      ],
    }).compile();

    service = module.get(CoachesService);
  });

  describe('upsert', () => {
    const externalIds = [
      { externalSystemId: 1, externalId: 'id:47' },
      { externalSystemId: 1, externalId: 'name:roze madder' },
    ];

    it('creates a new coach when no external IDs match', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));

      const result = await service.upsert({
        name: 'Roze Madder',
        externalIds,
      });

      expect(result).toEqual({ coach: fakeCoach, created: true });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('updates the matching coach when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { ownerId: 1, externalSystemId: 1, externalId: 'id:47' },
          ]),
        );

      const result = await service.upsert({
        name: 'Roze Madder',
        externalIds,
      });

      expect(result).toEqual({ coach: fakeCoach, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws CoachUpsertConflictError when external IDs match different coaches', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { ownerId: 1, externalSystemId: 1, externalId: 'id:47' },
          {
            ownerId: 2,
            externalSystemId: 1,
            externalId: 'name:roze madder',
          },
        ]),
      );

      await expect(
        service.upsert({ name: 'Roze Madder', externalIds }),
      ).rejects.toThrow(CoachUpsertConflictError);
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched coach', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { ownerId: 1, externalSystemId: 1, externalId: 'id:47' },
          {
            ownerId: 1,
            externalSystemId: 1,
            externalId: 'name:roze madder',
          },
        ]),
      );

      await service.upsert({ name: 'Roze Madder', externalIds });

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing coach', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { ownerId: 1, externalSystemId: 1, externalId: 'id:47' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeCoach]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert({ name: 'Roze Madder', externalIds });

      expect(insertValues).toHaveBeenCalledWith([
        { coachId: 1, externalSystemId: 1, externalId: 'name:roze madder' },
      ]);
    });
  });

  describe('toplist queries', () => {
    it('countMatchesPlayedByCoach returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 9 },
        { coachId: 2, name: 'Grashnak', count: 4 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countMatchesPlayedByCoach(FACT_SCOPE_ALL_TIME),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countTeamsByCoach returns the rows the query resolves to', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 3 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countTeamsByCoach(FACT_SCOPE_ALL_TIME),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
      const selectedFields = firstCallArg(select, 0, 0) as { count: unknown };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });

    it('countMatchesPlayedByCoach filters by era when an eraId is given', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 2 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countMatchesPlayedByCoach({ eraId: 20 }),
      ).resolves.toEqual(rows);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.match_id', 'matches.id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(20);
    });

    it('countTeamsByCoach joins team_eras when an eraId is given', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 1 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countTeamsByCoach({ eraId: 20 })).resolves.toEqual(
        rows,
      );
      // Era path adds a second innerJoin (teams + teamEras) vs. one when unfiltered.
      expect(builder.innerJoin).toHaveBeenCalledTimes(2);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['team_eras.team_id', 'teams.id', 'team_eras.era_id'],
      );
      const selectedFields = firstCallArg(select, 0, 0) as { count: unknown };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });

    it('countCompetitionsByCoach returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 5 },
        { coachId: 2, name: 'Grashnak', count: 2 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countCompetitionsByCoach(FACT_SCOPE_ALL_TIME),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCompetitionsByCoach filters by era when an eraId is given', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 3 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countCompetitionsByCoach({ eraId: 20 }),
      ).resolves.toEqual(rows);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['competition_teams.competition_id', 'competitions.id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(20);
    });

    it('countErasByCoach returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', count: 3 },
        { coachId: 2, name: 'Grashnak', count: 3 },
        { coachId: 3, name: 'Skabsquik', count: 1 },
      ];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countErasByCoach()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['teams.id', 'team_eras.team_id'],
      );
    });
  });

  describe('league scoping', () => {
    it('countMatchesPlayedByCoach filters by league via the eras join', async () => {
      const builder = makeQueryBuilder([]);
      const service = new CoachesService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await service.countMatchesPlayedByCoach({ leagueId: 9 });
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 2, 1))).toEqual(
        ['eras.id', 'team_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });

    it('countCompetitionsByCoach filters by league via the eras join', async () => {
      const builder = makeQueryBuilder([]);
      const service = new CoachesService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await service.countCompetitionsByCoach({ leagueId: 9 });
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 2, 1))).toEqual(
        ['eras.id', 'team_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });

    it('countTeamsByCoach counts teams the coach ran in an era of the league', async () => {
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 2 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countTeamsByCoach({ leagueId: 9 })).resolves.toEqual(
        rows,
      );
      // League path adds two innerJoins (teams + teamEras + eras) vs. one unfiltered.
      expect(builder.innerJoin).toHaveBeenCalledTimes(3);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 2, 1))).toEqual(
        ['eras.id', 'team_eras.era_id', 'eras.league_id'],
      );
    });

    it('countTeamsByCoach does not double-count a team with teamEras rows in two eras of the same league', async () => {
      // The league scope joins teamEras unfiltered by era, then filters by
      // eras.leagueId. A team with separate teamEras rows in two different
      // eras of the *same* league (no unique constraint on teamId alone)
      // would join to two rows and be counted twice unless the aggregate
      // uses DISTINCT on teams.id.
      const rows = [{ coachId: 1, name: 'Roze Madder', count: 1 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countTeamsByCoach({ leagueId: 9 })).resolves.toEqual(
        rows,
      );
      const selectedFields = firstCallArg(select, 0, 0) as { count: unknown };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new CoachesService(
        {
          select: vi.fn(() => ({ from })),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByEra', () => {
    function makeCountBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => builder);
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject);
      return builder;
    }

    it('returns the distinct coach count for the era', async () => {
      const builder = makeCountBuilder([{ count: 6 }]);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countByEra(5)).resolves.toBe(6);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['teams.id', 'team_eras.team_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    function makeCountBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => builder);
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject);
      return builder;
    }

    it('returns the distinct coach count for the league', async () => {
      const builder = makeCountBuilder([{ count: 15 }]);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countByLeague(9)).resolves.toBe(15);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['teams.id', 'team_eras.team_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['eras.id', 'team_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    function makeCountBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => builder);
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve(rows).then(resolve, reject);
      return builder;
    }

    it('returns the distinct coach count for the competition', async () => {
      const builder = makeCountBuilder([{ count: 4 }]);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countByCompetition(7)).resolves.toBe(4);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['team_eras.id', 'competition_teams.team_era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    });
  });

  describe('findById', () => {
    it('returns the coach the query resolves to', async () => {
      const where = vi.fn().mockResolvedValue([{ id: 7, name: 'Roze Madder' }]);
      const from = vi.fn(() => ({ where }));
      const service = new CoachesService(
        {
          select: vi.fn(() => ({ from })),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: 'Roze Madder',
      });
      expect(extractFilterValues(firstCallArg(where))).toBe(7);
    });

    it('returns undefined when no coach matches', async () => {
      const where = vi.fn().mockResolvedValue([]);
      const from = vi.fn(() => ({ where }));
      const service = new CoachesService(
        {
          select: vi.fn(() => ({ from })),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.findById(999)).resolves.toBeUndefined();
      expect(extractFilterValues(firstCallArg(where))).toBe(999);
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns id/name choices for a name prefix, capped to the limit', async () => {
      const rows = [
        { id: 1, name: 'Roze Madder' },
        { id: 2, name: 'Rozzo' },
      ];
      const limit = vi.fn().mockResolvedValue(rows);
      const where = vi.fn(() => ({ limit }));
      const from = vi.fn(() => ({ where }));
      const service = new CoachesService(
        {
          select: vi.fn(() => ({ from })),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.searchByNamePrefix('Ro', 25)).resolves.toEqual(rows);
      expect(limit).toHaveBeenCalledWith(25);
    });
  });

  describe('getCareerSpan', () => {
    function makeSpanBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => Promise.resolve(rows));
      return builder;
    }

    it('returns the min/max match dates for the coach', async () => {
      const builder = makeSpanBuilder([
        { start: '2021-09-01', end: '2023-06-10' },
      ]);
      const service = new CoachesService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.getCareerSpan(7)).resolves.toEqual({
        start: '2021-09-01',
        end: '2023-06-10',
      });
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    });

    it('returns undefined when the coach has played no matches', async () => {
      const builder = makeSpanBuilder([{ start: null, end: null }]);
      const service = new CoachesService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.getCareerSpan(7)).resolves.toBeUndefined();
    });
  });

  describe('getTopTeamsByMatchesPlayed', () => {
    function makeTopTeamsBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => builder);
      builder.groupBy = vi.fn(() => builder);
      builder.orderBy = vi.fn(() => builder);
      builder.limit = vi.fn(() => Promise.resolve(rows));
      return builder;
    }

    it('returns teams ranked by match count, capped to the limit', async () => {
      const rows = [
        { id: 11, name: 'Reikland Reavers', count: 12 },
        { id: 22, name: 'Gouged Eye', count: 5 },
      ];
      const builder = makeTopTeamsBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new CoachesService(
        {
          select,
        } as unknown as Db,
        likePattern,
      );
      await expect(service.getTopTeamsByMatchesPlayed(7, 10)).resolves.toEqual(
        rows,
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
      expect(builder.limit).toHaveBeenCalledWith(10);
      const selectArg = (service['db'].select as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      expect(Object.keys(selectArg)).toContain('id');
    });

    it('includes a tie group at the cutoff (relies on a generous limit)', async () => {
      // The service returns whatever the query yields; ranking/tie-cutoff is the
      // resolver's job (Task 5). This asserts the limit is passed through so a
      // tie at the 5th place can be detected downstream.
      const rows = Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: `Team ${i + 1}`,
        count: i < 6 ? 5 : 1,
      }));
      const builder = makeTopTeamsBuilder(rows);
      const service = new CoachesService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.getTopTeamsByMatchesPlayed(7, 10)).resolves.toEqual(
        rows,
      );
      expect(builder.limit).toHaveBeenCalledWith(10);
    });
  });
});

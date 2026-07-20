import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { PlayersService, PlayerUpsertConflictError } from './players.service';

const fakePlayer = {
  id: 1,
  name: 'Griff Oberwald',
  teamEraId: 10,
  positionId: 20,
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

describe('PlayersService', () => {
  let service: PlayersService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakePlayer])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakePlayer]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakePlayer]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [PlayersService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(PlayersService);
  });

  describe('upsert', () => {
    const base = { name: 'Griff Oberwald', teamEraId: 10, positionId: 20 };
    const externalIds = [
      { externalSystemId: 1, externalId: '12345' },
      { externalSystemId: 2, externalId: 'Griff Oberwald' },
    ];

    it('creates a new player when no external IDs match', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));

      const result = await service.upsert({ ...base, externalIds });

      expect(result).toEqual({ player: fakePlayer, created: true });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('updates the matching player when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { ownerId: 1, externalSystemId: 1, externalId: '12345' },
          ]),
        );

      const result = await service.upsert({ ...base, externalIds });

      expect(result).toEqual({ player: fakePlayer, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws PlayerUpsertConflictError when external IDs match different players', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { ownerId: 1, externalSystemId: 1, externalId: '12345' },
          { ownerId: 2, externalSystemId: 2, externalId: 'Griff Oberwald' },
        ]),
      );

      await expect(service.upsert({ ...base, externalIds })).rejects.toThrow(
        PlayerUpsertConflictError,
      );
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched player', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { ownerId: 1, externalSystemId: 1, externalId: '12345' },
          { ownerId: 1, externalSystemId: 2, externalId: 'Griff Oberwald' },
        ]),
      );

      await service.upsert({ ...base, externalIds });

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing player', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { ownerId: 1, externalSystemId: 1, externalId: '12345' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakePlayer]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert({ ...base, externalIds });

      expect(insertValues).toHaveBeenCalledWith([
        { playerId: 1, externalSystemId: 2, externalId: 'Griff Oberwald' },
      ]);
    });
  });

  describe('findById', () => {
    function makeJoinSelect(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn().mockResolvedValue(rows);
      return builder;
    }

    it('returns the joined player detail row', async () => {
      const row = {
        id: 1,
        name: 'Griff Oberwald',
        teamName: 'Reikland Reavers',
        raceName: 'Human',
        positionName: 'Blitzer',
      };
      const builder = makeJoinSelect([row]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await expect(service.findById(1)).resolves.toEqual(row);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(1);
    });

    it('returns undefined when no player matches', async () => {
      const builder = makeJoinSelect([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await expect(service.findById(999)).resolves.toBeUndefined();
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns id, name, and team for name-prefix matches', async () => {
      const rows = [
        { id: 1, name: 'Griff Oberwald', teamName: 'Reikland Reavers' },
      ];
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => builder);
      builder.limit = vi.fn().mockResolvedValue(rows);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await expect(service.searchByNamePrefix('Gri', 25)).resolves.toEqual(
        rows,
      );
      expect(builder.innerJoin).toHaveBeenCalledTimes(2);
      expect(builder.limit).toHaveBeenCalledWith(25);
    });
  });

  describe('getDeepdiveCategoryCounts', () => {
    function makeCountSelect(n: number) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn().mockResolvedValue([{ count: n }]);
      return builder;
    }

    const expectedLabels = [
      'MVP awards',
      'Touchdowns scored',
      'Completions',
      'Interceptions',
      'Deflections',
      'Casualties inflicted',
      'Serious injuries inflicted',
      'Opponents killed',
      'Fouls committed',
    ];

    it('returns all nine categories in fixed order with their counts', async () => {
      const counts = [2, 5, 3, 1, 4, 6, 0, 0, 7];
      const select = vi.fn();
      for (const n of counts) select.mockReturnValueOnce(makeCountSelect(n));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.getDeepdiveCategoryCounts(1)).resolves.toEqual(
        expectedLabels.map((label, i) => ({ label, count: counts[i] })),
      );
      expect(select).toHaveBeenCalledTimes(9);
    });

    it('returns every category as zero for a player with no events', async () => {
      const select = vi.fn(() => makeCountSelect(0));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.getDeepdiveCategoryCounts(1)).resolves.toEqual(
        expectedLabels.map((label) => ({ label, count: 0 })),
      );
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new PlayersService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
      await expect(service.countAll()).resolves.toBe(5);
      expect(from).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByEra', () => {
    it('returns the player count for the era', async () => {
      const builder = makeCountBuilder([{ count: 88 }]);
      const select = vi.fn(() => builder);
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countByEra(5)).resolves.toBe(88);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['team_eras.id', 'players.team_era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(5);
    });
  });

  describe('countByCompetition', () => {
    it('returns the player count for the competition', async () => {
      const builder = makeCountBuilder([{ count: 42 }]);
      const select = vi.fn(() => builder);
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countByCompetition(7)).resolves.toBe(42);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['competition_teams.team_era_id', 'players.team_era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    });
  });

  describe('toplist queries', () => {
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

    it('countMvpAwardsByPlayer returns the rows the query resolves to', async () => {
      const rows = [
        { playerId: 1, name: 'Griff Oberwald', count: 7 },
        { playerId: 2, name: 'Morg n Thorg', count: 3 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countMvpAwardsByPlayer()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countMvpAwardsByPlayer returns an empty array when there are no rows', async () => {
      const select = vi.fn(() => makeQueryBuilder([]));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countMvpAwardsByPlayer()).resolves.toEqual([]);
    });

    it('countMvpAwardsByPlayer preserves tie ordering from the query', async () => {
      const rows = [
        { playerId: 1, name: 'Griff Oberwald', count: 5 },
        { playerId: 2, name: 'Morg n Thorg', count: 5 },
        { playerId: 3, name: 'Zug', count: 2 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countMvpAwardsByPlayer()).resolves.toEqual(rows);
    });

    it('countMvpAwardsByPlayer adds an era filter when an eraId is given', async () => {
      const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 2 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countMvpAwardsByPlayer(20)).resolves.toEqual(rows);
      // The where() call is always present; the era clause is folded into it.
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'mvp_award',
        20,
      ]);
    });

    it('countMvpAwardsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countMvpAwardsByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.acting_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'mvp_award',
        30,
      ]);
    });

    it('countTouchdownsScoredByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 9 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countTouchdownsScoredByPlayer()).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countTouchdownsScoredByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTouchdownsScoredByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'touchdown',
        20,
      ]);
    });

    it('countTouchdownsScoredByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTouchdownsScoredByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.acting_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'touchdown',
        30,
      ]);
    });

    it('countCompletionsByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 6 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countCompletionsByPlayer()).resolves.toEqual(rows);
    });

    it('countCompletionsByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCompletionsByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'completion',
        20,
      ]);
    });

    it('countCompletionsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCompletionsByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.acting_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'completion',
        30,
      ]);
    });

    it('countInterceptionsByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 4 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countInterceptionsByPlayer()).resolves.toEqual(rows);
    });

    it('countInterceptionsByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countInterceptionsByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'interception',
        20,
      ]);
    });

    it('countInterceptionsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countInterceptionsByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.acting_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'interception',
        30,
      ]);
    });

    it('countDeflectionsByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 3 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countDeflectionsByPlayer()).resolves.toEqual(rows);
    });

    it('countDeflectionsByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeflectionsByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'deflection',
        20,
      ]);
    });

    it('countDeflectionsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeflectionsByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.acting_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'deflection',
        30,
      ]);
    });

    it('countCasualtiesCausedByPlayer returns the rows the query resolves to', async () => {
      const rows = [
        { playerId: 1, name: 'Morg n Thorg', count: 11 },
        { playerId: 2, name: 'Griff Oberwald', count: 4 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countCasualtiesCausedByPlayer()).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCasualtiesCausedByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesCausedByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'casualty',
        'badly_hurt',
        'serious_injury',
        'death',
        20,
      ]);
    });

    it('countCasualtiesCausedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesCausedByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.acting_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'casualty',
        'badly_hurt',
        'serious_injury',
        'death',
        30,
      ]);
    });

    it('countSeriousInjuriesCausedByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 3 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(
        service.countSeriousInjuriesCausedByPlayer(),
      ).resolves.toEqual(rows);
    });

    it('countSeriousInjuriesCausedByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesCausedByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'serious_injury',
        20,
      ]);
    });

    it('countSeriousInjuriesCausedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesCausedByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.acting_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'serious_injury',
        30,
      ]);
    });

    it('countDeathsCausedByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 2 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countDeathsCausedByPlayer()).resolves.toEqual(rows);
    });

    it('countDeathsCausedByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsCausedByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'death',
        20,
      ]);
    });

    it('countDeathsCausedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsCausedByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.acting_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'death',
        30,
      ]);
    });

    it('countFoulsCommittedByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 6 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countFoulsCommittedByPlayer()).resolves.toEqual(
        rows,
      );
    });

    it('countFoulsCommittedByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countFoulsCommittedByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'foul',
        20,
      ]);
    });

    it('countFoulsCommittedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countFoulsCommittedByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.acting_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'foul',
        30,
      ]);
    });

    it('countTimesSentOffByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 5 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countTimesSentOffByPlayer()).resolves.toEqual(rows);
    });

    it('countTimesSentOffByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTimesSentOffByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'sent_off',
        20,
      ]);
    });

    it('countTimesSentOffByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTimesSentOffByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.consequence_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'sent_off',
        30,
      ]);
    });

    it('countCasualtiesSufferedByPlayer returns the rows the query resolves to', async () => {
      const rows = [
        { playerId: 1, name: 'Griff Oberwald', count: 9 },
        { playerId: 2, name: 'Zug', count: 4 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countCasualtiesSufferedByPlayer()).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCasualtiesSufferedByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesSufferedByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'casualty',
        'badly_hurt',
        'death',
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        20,
      ]);
    });

    it('countCasualtiesSufferedByPlayer filters on the full casualty-suffered consequence type list', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesSufferedByPlayer();
      const condition = firstCallArg(builder.where);
      expect(extractFilterValues(condition)).toEqual([
        'casualty',
        'badly_hurt',
        'death',
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
      ]);
    });

    it('countCasualtiesSufferedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesSufferedByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.consequence_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'casualty',
        'badly_hurt',
        'death',
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        30,
      ]);
    });

    it('countSeriousInjuriesSufferedByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 5 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(
        service.countSeriousInjuriesSufferedByPlayer(),
      ).resolves.toEqual(rows);
    });

    it('countSeriousInjuriesSufferedByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesSufferedByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        20,
      ]);
    });

    it('countSeriousInjuriesSufferedByPlayer filters on the serious-injury-suffered consequence type list', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesSufferedByPlayer();
      const condition = firstCallArg(builder.where);
      expect(extractFilterValues(condition)).toEqual([
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
      ]);
    });

    it('countSeriousInjuriesSufferedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesSufferedByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.consequence_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'serious_injury',
        'niggling_injury',
        'miss_next_game',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        30,
      ]);
    });

    it('countLastingInjuriesSufferedByPlayer returns the rows the query resolves to', async () => {
      const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 3 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(
        service.countLastingInjuriesSufferedByPlayer(),
      ).resolves.toEqual(rows);
    });

    it('countLastingInjuriesSufferedByPlayer adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countLastingInjuriesSufferedByPlayer(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'niggling_injury',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        20,
      ]);
    });

    it('countLastingInjuriesSufferedByPlayer filters on the lasting-injury-suffered consequence type list', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countLastingInjuriesSufferedByPlayer();
      const condition = firstCallArg(builder.where);
      expect(extractFilterValues(condition)).toEqual([
        'niggling_injury',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
      ]);
    });

    it('countLastingInjuriesSufferedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new PlayersService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countLastingInjuriesSufferedByPlayer(undefined, 30);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['players.id', 'match_events.consequence_player_id'],
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'niggling_injury',
        'stat_reduction_ma',
        'stat_reduction_st',
        'stat_reduction_ag',
        'stat_reduction_av',
        30,
      ]);
    });
  });
});

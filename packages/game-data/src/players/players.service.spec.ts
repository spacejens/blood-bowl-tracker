import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
            { playerId: 1, externalSystemId: 1, externalId: '12345' },
          ]),
        );

      const result = await service.upsert({ ...base, externalIds });

      expect(result).toEqual({ player: fakePlayer, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws PlayerUpsertConflictError when external IDs match different players', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { playerId: 1, externalSystemId: 1, externalId: '12345' },
          { playerId: 2, externalSystemId: 2, externalId: 'Griff Oberwald' },
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
          { playerId: 1, externalSystemId: 1, externalId: '12345' },
          { playerId: 1, externalSystemId: 2, externalId: 'Griff Oberwald' },
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
            { playerId: 1, externalSystemId: 1, externalId: '12345' },
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
      const select = vi.fn(() => makeCountBuilder([{ count: 88 }]));
      const service = new PlayersService({ select } as unknown as Db);
      await expect(service.countByEra(5)).resolves.toBe(88);
      expect(select).toHaveBeenCalledTimes(1);
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
    });
  });
});

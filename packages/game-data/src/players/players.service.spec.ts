import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LikePatternService } from '../shared/like-pattern.service';
import {
  CASUALTY_CAUSED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  MVP_AWARD_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
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
  const likePattern = new LikePatternService();
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
      providers: [
        PlayersService,
        LikePatternService,
        { provide: DB, useValue: mockDb },
      ],
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
        teamId: 11,
        raceName: 'Human',
        raceId: 4,
        positionName: 'Blitzer',
      };
      const builder = makeJoinSelect([row]);
      const select = vi.fn(() => builder);
      const service = new PlayersService(
        {
          select,
        } as unknown as Db,
        likePattern,
      );
      await expect(service.findById(1)).resolves.toEqual(row);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(1);
      const selectArg = (select as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['teamId', 'raceId']),
      );
    });

    it('returns undefined when no player matches', async () => {
      const builder = makeJoinSelect([]);
      const service = new PlayersService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new PlayersService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new PlayersService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.getDeepdiveCategoryCounts(1)).resolves.toEqual(
        expectedLabels.map((label, i) => ({ label, count: counts[i] })),
      );
      expect(select).toHaveBeenCalledTimes(9);
    });

    it('returns every category as zero for a player with no events', async () => {
      const select = vi.fn(() => makeCountSelect(0));
      const service = new PlayersService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.getDeepdiveCategoryCounts(1)).resolves.toEqual(
        expectedLabels.map((label) => ({ label, count: 0 })),
      );
    });

    it('binds each category label to its own type-set selector, in order', async () => {
      // Mirrors the fixed label -> *_TYPES mapping from the deepdive plan; a
      // transposition of two entries here would leave the two tests above
      // green (they only check labels and counts), so this test inspects the
      // actual `inArray(matchEvents.actionType, ...)` values each call built.
      const expectedTypeSets: readonly (readonly string[])[] = [
        MVP_AWARD_TYPES,
        TOUCHDOWN_TYPES,
        COMPLETION_TYPES,
        INTERCEPTION_TYPES,
        DEFLECTION_TYPES,
        CASUALTY_CAUSED_TYPES,
        SERIOUS_INJURY_CAUSED_TYPES,
        DEATH_CAUSED_TYPES,
        FOUL_TYPES,
      ];
      const builders = expectedTypeSets.map(() => makeCountSelect(0));
      const select = vi.fn();
      for (const builder of builders) select.mockReturnValueOnce(builder);
      const service = new PlayersService(
        { select } as unknown as Db,
        likePattern,
      );

      await service.getDeepdiveCategoryCounts(1);

      builders.forEach((builder, index) => {
        const values = extractAllFilterValues(firstCallArg(builder.where));
        // The where clause is `and(inArray(actionType, types), eq(players.id,
        // playerId))`; the trailing value is the playerId param, so the
        // type-set values are everything before it.
        expect(values.slice(0, -1)).toEqual([...expectedTypeSets[index]]);
      });
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const from = vi.fn().mockResolvedValue([{ count: 5 }]);
      const service = new PlayersService(
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
    it('returns the player count for the era', async () => {
      const builder = makeCountBuilder([{ count: 88 }]);
      const select = vi.fn(() => builder);
      const service = new PlayersService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countByEra(5)).resolves.toBe(88);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['team_eras.id', 'players.team_era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    it('returns the player count for the league', async () => {
      const builder = makeCountBuilder([{ count: 130 }]);
      const select = vi.fn(() => builder);
      const service = new PlayersService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countByLeague(9)).resolves.toBe(130);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['team_eras.id', 'players.team_era_id'],
      );
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 1, 1))).toEqual(
        ['eras.id', 'team_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    it('returns the player count for the competition', async () => {
      const builder = makeCountBuilder([{ count: 42 }]);
      const select = vi.fn(() => builder);
      const service = new PlayersService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countByCompetition(7)).resolves.toBe(42);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['competition_teams.team_era_id', 'players.team_era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    });
  });
});

import type { Db } from '@blood-bowl-tracker/db';
import { DB, positions } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import {
  PositionsService,
  PositionUpsertConflictError,
} from './positions.service';

const fakePosition = {
  id: 1,
  name: 'Lineman',
  isStarPlayer: false,
  createdAt: new Date('2026-01-01'),
};

describe('PositionsService', () => {
  let service: PositionsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [PositionsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(PositionsService);
    return { db, chains };
  }

  const data = {
    name: 'Lineman',
    isStarPlayer: false,
    externalIds: [
      { externalSystemId: 1, externalId: '10-7' },
      { externalSystemId: 2, externalId: 'Orc: Lineman' },
    ],
  };

  it('creates a new position when no external IDs match', async () => {
    // query 0: external-id lookup finds nothing; query 1: the insert returns
    // the row; query 2: both external IDs are new, so they get inserted.
    const { db, chains } = await build([], [fakePosition]);

    const result = await service.upsert(data);

    expect(result).toEqual({
      position: fakePosition,
      created: true,
    });
    expect(chains).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(db.insert).toHaveBeenCalledWith(positions);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(db.update).not.toHaveBeenCalled();
  });

  it('inserts the position with its name and isStarPlayer flag', async () => {
    const { chains } = await build([], [fakePosition]);

    await service.upsert({ ...data, isStarPlayer: true });

    expect(firstCallArg(chains[1].values)).toEqual({
      name: 'Lineman',
      isStarPlayer: true,
    });
  });

  it('updates the matching position when exactly one external ID matches', async () => {
    // query 0: external-id lookup finds one owner; query 1: the update
    // returns the row; query 2: the one still-missing external ID gets
    // inserted.
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
    );

    const result = await service.upsert(data);

    expect(result.created).toBe(false);
    expect(chains).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(db.update).toHaveBeenCalledWith(positions);
  });

  it('throws PositionUpsertConflictError when external IDs match different positions', async () => {
    const { db, chains } = await build([
      { ownerId: 1, externalSystemId: 1, externalId: '10-7' },
      { ownerId: 2, externalSystemId: 2, externalId: 'Orc: Lineman' },
    ]);

    await expect(service.upsert(data)).rejects.toThrow(
      PositionUpsertConflictError,
    );
    expect(chains).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(db.insert).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(db.update).not.toHaveBeenCalled();
  });

  it('inserts only the external IDs that are new for an existing position', async () => {
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
    );

    await service.upsert(data);

    expect(firstCallArg(chains[2].values)).toEqual([
      { positionId: 1, externalSystemId: 2, externalId: 'Orc: Lineman' },
    ]);
  });

  describe('syncRaceEras', () => {
    it('resolves (raceId, eraId) pairs to race_era ids and inserts positions_race_eras rows', async () => {
      // query 0: resolve race_eras for the given race ids; query 1: existing
      // positions_race_eras rows for the position; query 2: insert the newly
      // resolved links.
      const { chains } = await build(
        [
          { id: 100, raceId: 2, eraId: 5 },
          { id: 101, raceId: 2, eraId: 6 },
        ],
        [],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100, 101] });
      expect(chains).toHaveLength(3);
      expect(firstCallArg(chains[2].values)).toEqual([
        { positionId: 1, raceEraId: 100 },
        { positionId: 1, raceEraId: 101 },
      ]);
    });

    it('does not re-insert an already-present positions_race_eras row', async () => {
      const { chains } = await build(
        [
          { id: 100, raceId: 2, eraId: 5 },
          { id: 101, raceId: 2, eraId: 6 },
        ],
        [{ raceEraId: 100 }],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100, 101] });
      expect(chains).toHaveLength(3);
      expect(firstCallArg(chains[2].values)).toEqual([
        { positionId: 1, raceEraId: 101 },
      ]);
    });

    it('skips a (raceId, eraId) pair that has no matching race_era row', async () => {
      const { chains } = await build([{ id: 100, raceId: 2, eraId: 5 }], []);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      expect(firstCallArg(chains[2].values)).toEqual([
        { positionId: 1, raceEraId: 100 },
      ]);
    });

    it('dedupes duplicate resolved race_era ids so only one row is inserted', async () => {
      const { chains } = await build(
        [
          { id: 100, raceId: 2, eraId: 5 },
          { id: 100, raceId: 3, eraId: 5 },
        ],
        [],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 3, eraId: 5 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      expect(firstCallArg(chains[2].values)).toEqual([
        { positionId: 1, raceEraId: 100 },
      ]);
    });

    it('returns an empty list and inserts nothing for empty input', async () => {
      const { db, chains } = await build([], []);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [] });
      // `raceEras.length === 0` returns before issuing any query.
      expect(chains).toHaveLength(0);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { db } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByEra', () => {
    it('counts distinct positions available in the era via positions_race_eras', async () => {
      const { chains } = await build([{ count: 40 }]);
      await expect(service.countByEra(5)).resolves.toBe(40);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['race_eras.id', 'positions_race_eras.race_era_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    it('counts distinct positions available in the league via positions_race_eras', async () => {
      const { chains } = await build([{ count: 60 }]);
      await expect(service.countByLeague(9)).resolves.toBe(60);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['race_eras.id', 'positions_race_eras.race_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'race_eras.era_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    it('counts distinct positions available for each team-era in the competition', async () => {
      const { chains } = await build([{ count: 25 }]);
      await expect(service.countByCompetition(7)).resolves.toBe(25);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(4);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'competition_teams.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual([
        'race_eras.race_id',
        'teams.race_id',
        'race_eras.era_id',
        'team_eras.era_id',
      ]);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1)),
      ).toEqual(['positions_race_eras.race_era_id', 'race_eras.id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });
});

import type { Db } from '@blood-bowl-tracker/db';
import { DB, positions } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractFilterValues,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PositionValidationError } from '../shared/position-validation-error';
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
    expect(db.insert).toHaveBeenCalledWith(positions);
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
    // query 0: external-id lookup finds one owner; query 1: the semantic
    // conflict check re-reads the existing row; query 2: the update returns
    // the row; query 3: the one still-missing external ID gets inserted.
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
      [fakePosition],
    );

    const result = await service.upsert(data);

    expect(result.created).toBe(false);
    expect(chains).toHaveLength(4);
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
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates only the supplied column, leaving isStarPlayer alone', async () => {
    // query 1 is the semantic-conflict re-read of the existing row; the
    // payload omits isStarPlayer, so the hook never compares it regardless
    // of what this returns.
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
      [fakePosition],
    );

    await service.upsert({
      name: 'Blitzer',
      renameExisting: true,
      externalIds: [
        { externalSystemId: 1, externalId: '10-7' },
        { externalSystemId: 2, externalId: 'Orc: Lineman' },
      ],
    });

    expect(firstCallArg(chains[2].set)).toEqual({ name: 'Blitzer' });
  });

  it('keeps the stored name when an update does not ask to rename', async () => {
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
      [fakePosition],
    );

    await service.upsert({
      name: 'Raw Spelling',
      isStarPlayer: false,
      externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
    });

    expect(firstCallArg(chains[2].set)).toEqual({ isStarPlayer: false });
  });

  it('renames on update when the payload asks to', async () => {
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
      [fakePosition],
    );

    await service.upsert({
      name: 'Curated',
      renameExisting: true,
      isStarPlayer: false,
      externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
    });

    expect(firstCallArg(chains[2].set)).toEqual({
      name: 'Curated',
      isStarPlayer: false,
    });
  });

  it('updates only isStarPlayer when it is the sole supplied column, even when false', async () => {
    // false is falsy: this proves the strip logic checks `!== undefined`,
    // not truthiness, so a deliberate false still reaches .set(). The
    // existing row's isStarPlayer must also be false so the semantic
    // conflict check does not reject this as a star/regular mismatch.
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [{ ...fakePosition, isStarPlayer: false }],
      [fakePosition],
    );

    await service.upsert({
      isStarPlayer: false,
      externalIds: [
        { externalSystemId: 1, externalId: '10-7' },
        { externalSystemId: 2, externalId: 'Orc: Lineman' },
      ],
    });

    expect(firstCallArg(chains[2].set)).toEqual({ isStarPlayer: false });
  });

  it('inserts only the external IDs that are new for an existing position', async () => {
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
      [fakePosition],
    );

    await service.upsert(data);

    expect(firstCallArg(chains[3].values)).toEqual([
      { positionId: 1, externalSystemId: 2, externalId: 'Orc: Lineman' },
    ]);
  });

  it('rejects as a conflict when a star position external id matches an existing regular position', async () => {
    // The external-id lookup matches exactly one owner (not >1), so without
    // the semantic conflict check this would silently flip the existing
    // regular position to a star position. query 1 is the re-read of that
    // existing row, which reports isStarPlayer: false while the incoming
    // payload says true.
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Zzharg Madeye' }],
      [{ ...fakePosition, isStarPlayer: false }],
    );

    await expect(
      service.upsert({
        name: 'Zzharg Madeye',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 1, externalId: 'Zzharg Madeye' },
          { externalSystemId: 2, externalId: 'Zzharg Madeye' },
        ],
      }),
    ).rejects.toThrow(PositionUpsertConflictError);
    expect(chains).toHaveLength(2);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects as a conflict when a regular position external id matches an existing star position', async () => {
    // Same collision, opposite direction: the existing matched row is
    // already a star position, but the incoming payload says regular.
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Zzharg Madeye' }],
      [{ ...fakePosition, isStarPlayer: true }],
    );

    await expect(
      service.upsert({
        name: 'Zzharg Madeye',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: 'Zzharg Madeye' },
          { externalSystemId: 2, externalId: 'Orc: Zzharg Madeye' },
        ],
      }),
    ).rejects.toThrow(PositionUpsertConflictError);
    expect(chains).toHaveLength(2);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  describe('syncRaceEras', () => {
    it('resolves (raceId, eraId) pairs to race_era ids and inserts positions_race_eras rows', async () => {
      // query 0: the position exists; query 1: resolve race_eras for the
      // given race ids; query 2: existing positions_race_eras rows for the
      // position; query 3: insert the newly resolved links.
      const { chains } = await build(
        [{ id: 1 }],
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
      expect(chains).toHaveLength(4);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(1);
      expect(firstCallArg(chains[3].values)).toEqual([
        { positionId: 1, raceEraId: 100 },
        { positionId: 1, raceEraId: 101 },
      ]);
    });

    it('does not re-insert an already-present positions_race_eras row', async () => {
      const { chains } = await build(
        [{ id: 1 }],
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
      expect(chains).toHaveLength(4);
      expect(firstCallArg(chains[3].values)).toEqual([
        { positionId: 1, raceEraId: 101 },
      ]);
    });

    it('inserts nothing when every resolved link is already present', async () => {
      const { db, chains } = await build(
        [{ id: 1 }],
        [{ id: 100, raceId: 2, eraId: 5 }],
        [{ raceEraId: 100 }],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [{ raceId: 2, eraId: 5 }],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      expect(chains).toHaveLength(3);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('rejects a (raceId, eraId) pair that has no matching race_era row, writing nothing', async () => {
      const { db, chains } = await build(
        [{ id: 1 }],
        [{ id: 100, raceId: 2, eraId: 5 }],
      );

      const promise = service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      await expect(promise).rejects.toBeInstanceOf(PositionValidationError);
      await expect(promise).rejects.toThrow(
        'Race 2 is not available in era 6 (no race_eras row), so position 1 cannot be made available there',
      );
      // The position and race-era lookups ran; the existing-links lookup and
      // the insert never did.
      expect(chains).toHaveLength(2);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('rejects a position that does not exist, before resolving any race era', async () => {
      const { db, chains } = await build([]);

      const promise = service.syncRaceEras({
        positionId: 1,
        raceEras: [{ raceId: 2, eraId: 5 }],
      });

      await expect(promise).rejects.toBeInstanceOf(PositionValidationError);
      await expect(promise).rejects.toThrow(
        'Position 1 does not exist, so no race/era availability can be recorded for it',
      );
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('collapses a pair repeated within the batch onto one link', async () => {
      const { chains } = await build(
        [{ id: 1 }],
        [{ id: 100, raceId: 2, eraId: 5 }],
        [],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 5 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      expect(firstCallArg(chains[3].values)).toEqual([
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
      expect(db.insert).not.toHaveBeenCalled();
    });
  });
});

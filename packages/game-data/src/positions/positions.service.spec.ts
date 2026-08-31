import type { Db } from '@blood-bowl-tracker/db';
import { DB, positions } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { describe, expect, it } from 'vitest';

import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import {
  PositionRulesSetFormatMismatchError,
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
    transaction: Mock;
  }> {
    const { db, chains, transaction } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [PositionsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(PositionsService);
    return { db, chains, transaction };
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
      externalIds: [
        { externalSystemId: 1, externalId: '10-7' },
        { externalSystemId: 2, externalId: 'Orc: Lineman' },
      ],
    });

    expect(firstCallArg(chains[2].set)).toEqual({ name: 'Blitzer' });
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

    it('returns no ids and issues no further query when every pair is unresolved', async () => {
      const { chains } = await build([]);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [{ raceId: 2, eraId: 5 }],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [] });
      // Only the race_eras resolution query runs; nothing reads or writes
      // positions_race_eras once every pair resolves to nothing.
      expect(chains).toHaveLength(1);
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
      expect(db.insert).not.toHaveBeenCalled();
    });

    const bareFormats = {
      id: 7,
      moveFormat: 'bare',
      strengthFormat: 'bare',
      agilityFormat: 'plus',
      passingFormat: 'bare',
      armourFormat: 'plus',
    };
    const noPassingFormats = { ...bareFormats, id: 8, passingFormat: 'absent' };

    const characteristics = {
      rulesSetId: 7,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    };

    it('inserts a new row with its characteristics when the entry carries them', async () => {
      // query 0: rules-set formats; query 1: resolve race_eras; query 2:
      // existing positions_race_eras rows; query 3: the insert.
      const { chains, transaction } = await build(
        [bareFormats],
        [{ id: 100, raceId: 2, eraId: 5 }],
        [],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [{ raceId: 2, eraId: 5, characteristics }],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      expect(transaction).toHaveBeenCalledOnce();
      expect(firstCallArg(chains[3].values)).toEqual([
        {
          positionId: 1,
          raceEraId: 100,
          move: 6,
          strength: 3,
          agility: 3,
          passing: 4,
          armour: 9,
        },
      ]);
    });

    it('updates the characteristics in place when the row already exists', async () => {
      // query 0: formats; query 1: race_eras; query 2: the row already
      // exists; query 3: the update.
      const { chains } = await build(
        [bareFormats],
        [{ id: 100, raceId: 2, eraId: 5 }],
        [{ raceEraId: 100 }],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [{ raceId: 2, eraId: 5, characteristics }],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      expect(firstCallArg(chains[3].set)).toEqual({
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
      });
    });

    it('accepts a null passing for a rules set with no Passing characteristic', async () => {
      const { chains } = await build(
        [noPassingFormats],
        [{ id: 100, raceId: 2, eraId: 5 }],
        [],
      );

      await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          {
            raceId: 2,
            eraId: 5,
            characteristics: {
              ...characteristics,
              rulesSetId: 8,
              passing: null,
            },
          },
        ],
      });

      expect(firstCallArg(chains[3].values)).toEqual([
        {
          positionId: 1,
          raceEraId: 100,
          move: 6,
          strength: 3,
          agility: 3,
          passing: null,
          armour: 9,
        },
      ]);
    });

    it('rejects a passing value for a rules set that has no Passing', async () => {
      const { chains } = await build([noPassingFormats]);

      await expect(
        service.syncRaceEras({
          positionId: 1,
          raceEras: [
            {
              raceId: 2,
              eraId: 5,
              characteristics: { ...characteristics, rulesSetId: 8 },
            },
          ],
        }),
      ).rejects.toBeInstanceOf(PositionRulesSetFormatMismatchError);

      // Validation runs before anything is read or written beyond the
      // formats lookup itself.
      expect(chains).toHaveLength(1);
    });

    it('rejects a missing passing for a rules set that requires one', async () => {
      await build([bareFormats]);

      await expect(
        service.syncRaceEras({
          positionId: 1,
          raceEras: [
            {
              raceId: 2,
              eraId: 5,
              characteristics: { ...characteristics, passing: null },
            },
          ],
        }),
      ).rejects.toBeInstanceOf(PositionRulesSetFormatMismatchError);
    });

    it('rejects characteristics naming a rules set that does not exist', async () => {
      await build([]);

      await expect(
        service.syncRaceEras({
          positionId: 1,
          raceEras: [{ raceId: 2, eraId: 5, characteristics }],
        }),
      ).rejects.toBeInstanceOf(PositionRulesSetFormatMismatchError);
    });

    it('inserts an entry without characteristics alongside one with them', async () => {
      // query 0: formats; query 1: race_eras; query 2: existing rows;
      // query 3: insert of the availability-only rows; query 4: insert of
      // the rows carrying characteristics.
      const { chains } = await build(
        [bareFormats],
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
          { raceId: 2, eraId: 6, characteristics },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100, 101] });
      expect(firstCallArg(chains[3].values)).toEqual([
        { positionId: 1, raceEraId: 100 },
      ]);
      expect(firstCallArg(chains[4].values)).toEqual([
        {
          positionId: 1,
          raceEraId: 101,
          move: 6,
          strength: 3,
          agility: 3,
          passing: 4,
          armour: 9,
        },
      ]);
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { db } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
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

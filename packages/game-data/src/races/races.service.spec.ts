import type { Db } from '@blood-bowl-tracker/db';
import { DB, raceEras, races } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { RacesService, RaceUpsertConflictError } from './races.service';

const fakeRace = {
  id: 1,
  name: 'Orc',
  createdAt: new Date('2026-01-01'),
};

describe('RacesService', () => {
  let service: RacesService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [RacesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(RacesService);
    return { db, chains };
  }

  describe('upsert', () => {
    const baseData = {
      name: 'Orc',
      eras: [5, 6],
      externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
    };

    it('creates a new race with its eras when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: the one external ID is new and gets
      // inserted; query 3: no existing race_eras rows; query 4: both era
      // links are new and get inserted.
      const { chains } = await build([], [fakeRace], [], [], []);

      const result = await service.upsert(baseData);
      expect(result).toEqual({
        race: { ...fakeRace, eras: [5, 6] },
        created: true,
      });
      expect(chains).toHaveLength(5);
    });

    it('defaults to no era links when eras is empty', async () => {
      // eras: [] means toInsert is always empty, so query 4 (the race_eras
      // insert) never runs.
      const { chains } = await build([], [fakeRace], [], []);

      const result = await service.upsert({
        name: 'Orc',
        eras: [],
        externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
      });
      expect(result.race.eras).toEqual([]);
      expect(chains).toHaveLength(4);
    });

    it('inserts only the race_eras rows that are new', async () => {
      const { db, chains } = await build(
        [],
        [fakeRace],
        [],
        [{ eraId: 5 }],
        [],
      );
      const result = await service.upsert(baseData);
      expect(firstCallArg(chains[4].values)).toEqual([{ raceId: 1, eraId: 6 }]);
      expect(result.race.eras).toEqual([5, 6]);
      expect(db.insert).toHaveBeenCalledWith(raceEras);
    });

    it('does not insert race_eras rows when all links already exist', async () => {
      const { db, chains } = await build(
        [],
        [fakeRace],
        [],
        [{ eraId: 5 }, { eraId: 6 }],
      );
      const result = await service.upsert(baseData);
      expect(chains).toHaveLength(4);
      expect(db.insert).not.toHaveBeenCalledWith(raceEras);
      expect(result.race.eras).toEqual([5, 6]);
    });

    it('updates the matching race when exactly one external ID matches', async () => {
      // query 0: external-id lookup finds one owner (the one external ID
      // already matches, so no join-table insert runs); query 1: the update
      // returns the row; query 2: no existing race_eras rows; query 3: both
      // era links are new and get inserted.
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'Orc' }],
        [fakeRace],
        [],
        [],
      );
      const result = await service.upsert({
        ...baseData,
        renameExisting: true,
      });
      expect(result.created).toBe(false);
      expect(chains).toHaveLength(4);
      expect(db.update).toHaveBeenCalledWith(races);
    });

    it('keeps the stored name when an update does not ask to rename', async () => {
      // The lookup matches race 1 and the payload carries nothing else to
      // write, so the row is re-selected instead of updated: no history row.
      const { db } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'Orc' }],
        [fakeRace],
        [],
        [],
      );

      const result = await service.upsert({ ...baseData, name: 'Orcs' });

      expect(db.update).not.toHaveBeenCalled();
      expect(result.race.name).toBe('Orc');
    });

    it('renames on update when the payload asks to', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'Orc' }],
        [fakeRace],
        [],
        [],
      );

      await service.upsert({ ...baseData, name: 'Orcs', renameExisting: true });

      expect(firstCallArg(chains[1].set)).toEqual({ name: 'Orcs' });
    });

    it('throws RaceUpsertConflictError when external IDs match different races', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: 'Orc' },
        { ownerId: 2, externalSystemId: 2, externalId: 'Orc' },
      ]);
      await expect(service.upsert(baseData)).rejects.toThrow(
        RaceUpsertConflictError,
      );
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('re-selects instead of updating when the payload names no entity fields', async () => {
      // The lookup matches race 1, so the update is skipped and the row is
      // re-selected instead; the additive era sync still issues its own
      // queries (existing race_eras lookup, then the new link insert).
      const { db } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'Orc' }],
        [fakeRace],
        [],
        [],
      );

      const result = await service.upsert({
        eras: [5],
        externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
      });

      expect(db.update).not.toHaveBeenCalled();
      expect(result.race).toEqual({ ...fakeRace, eras: [5] });
    });
  });

  describe('listOngoingEras', () => {
    it('returns the id/name rows the query resolves to', async () => {
      const rows = [{ id: 5, name: 'Fifth era' }];
      await build(rows);
      await expect(service.listOngoingEras(7)).resolves.toEqual(rows);
    });

    it('returns an empty array when the race is in no ongoing era', async () => {
      await build([]);
      await expect(service.listOngoingEras(7)).resolves.toEqual([]);
    });

    it("keeps only the race's eras that have no end date", async () => {
      const { chains } = await build([]);

      await service.listOngoingEras(7);

      const where = firstCallArg(chains[0].where);
      expect(extractAllFilterValues(where)).toEqual([7]);
      expect(sqlText(where).match(/is null/g)).toHaveLength(1);
    });

    it('orders eras chronologically by start date, then name', async () => {
      const { chains } = await build([]);

      await service.listOngoingEras(7);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['eras.start_date'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['eras.name'],
      );
    });
  });
});

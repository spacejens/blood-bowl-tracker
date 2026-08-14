import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import type { MockDbResult } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SppAwardValuesService } from './spp-award-values.service';

async function makeService(db: MockDbResult): Promise<SppAwardValuesService> {
  const moduleRef = await Test.createTestingModule({
    providers: [SppAwardValuesService, { provide: DB, useValue: db.db }],
  }).compile();
  return moduleRef.get(SppAwardValuesService);
}

describe('SppAwardValuesService', () => {
  describe('sync', () => {
    it('returns no ids and issues no query for an empty values list', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const result = await service.sync({ values: [] });

      expect(result).toEqual({ sppAwardValueIds: [] });
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('looks up existing rows for every distinct rules set in the batch', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
          { rulesSetId: 2, raceId: null, actionType: 'touchdown', sppValue: 3 },
          { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
        ],
      });

      expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
        1, 2,
      ]);
    });

    it('bulk-inserts rows with no existing match and returns their ids', async () => {
      // Query 0: the existing-rows lookup (nothing there). Query 1: the insert.
      const db = mockDb([], [{ id: 11 }, { id: 12 }]);
      const service = await makeService(db);

      const result = await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
          { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
        ],
      });

      expect(result).toEqual({ sppAwardValueIds: [11, 12] });
      expect(db.chains).toHaveLength(2);
      expect(firstCallArg(db.chains[1].values)).toEqual([
        { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
      ]);
      expect(db.chains[1].onConflictDoUpdate).not.toHaveBeenCalled();
    });

    it('updates matched rows by id instead of inserting them', async () => {
      // Query 0: the lookup finds both rows. Queries 1 and 2: one UPDATE each.
      const db = mockDb(
        [
          { id: 11, rulesSetId: 1, raceId: null, actionType: 'touchdown' },
          { id: 12, rulesSetId: 1, raceId: 7, actionType: 'touchdown' },
        ],
        [{ id: 11 }],
        [{ id: 12 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 4 },
          { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 5 },
        ],
      });

      expect(result).toEqual({ sppAwardValueIds: [11, 12] });
      // Lookup plus two updates, and no insert statement at all.
      expect(db.chains).toHaveLength(3);
      expect(firstCallArg(db.chains[1].set)).toEqual({ sppValue: 4 });
      expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        11,
      ]);
      expect(firstCallArg(db.chains[2].set)).toEqual({ sppValue: 5 });
      expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        12,
      ]);
    });

    it('matches a baseline row on its null raceId rather than treating it as new', async () => {
      const db = mockDb(
        [{ id: 11, rulesSetId: 1, raceId: null, actionType: 'touchdown' }],
        [{ id: 11 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 4 },
        ],
      });

      expect(result).toEqual({ sppAwardValueIds: [11] });
      expect(db.chains).toHaveLength(2);
      expect(firstCallArg(db.chains[1].set)).toEqual({ sppValue: 4 });
    });

    it('splits a mixed batch into one insert and one update', async () => {
      // Query 0: lookup finds only the baseline row. Query 1: insert the new
      // race-specific row. Query 2: update the matched baseline row.
      const db = mockDb(
        [{ id: 11, rulesSetId: 1, raceId: null, actionType: 'touchdown' }],
        [{ id: 12 }],
        [{ id: 11 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 4 },
          { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
        ],
      });

      expect(result).toEqual({ sppAwardValueIds: [12, 11] });
      expect(firstCallArg(db.chains[1].values)).toEqual([
        { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
      ]);
      expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        11,
      ]);
    });

    it('does not match a row from a different rules set or action type', async () => {
      const db = mockDb(
        [
          { id: 11, rulesSetId: 1, raceId: null, actionType: 'completion' },
          { id: 12, rulesSetId: 1, raceId: 9, actionType: 'touchdown' },
        ],
        [{ id: 13 }],
      );
      const service = await makeService(db);

      const result = await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        ],
      });

      expect(result).toEqual({ sppAwardValueIds: [13] });
      expect(db.chains).toHaveLength(2);
      expect(firstCallArg(db.chains[1].values)).toEqual([
        { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
      ]);
    });

    it('performs the writes inside a single transaction', async () => {
      const db = mockDb([], [{ id: 11 }]);
      const service = await makeService(db);

      await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        ],
      });

      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('propagates a failing transaction rather than reporting a partial write', async () => {
      const db = mockDb([]);
      db.transaction.mockRejectedValue(new Error('connection lost'));
      const service = await makeService(db);

      await expect(
        service.sync({
          values: [
            {
              rulesSetId: 1,
              raceId: null,
              actionType: 'touchdown',
              sppValue: 3,
            },
          ],
        }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('resolveSppValue', () => {
    it('returns undefined without querying for an action type that earns no SPP', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const value = await service.resolveSppValue({
        actingPlayerId: 9,
        actionType: 'foul',
      });

      expect(value).toBeUndefined();
      expect(db.chains).toHaveLength(0);
    });

    it('returns the baseline value when the player race has no override', async () => {
      const db = mockDb([{ raceId: null, sppValue: 3 }]);
      const service = await makeService(db);

      const value = await service.resolveSppValue({
        actingPlayerId: 9,
        actionType: 'touchdown',
      });

      expect(value).toBe(3);
      expect(
        extractAllFilterValues(firstCallArg(db.chains[0].where)),
      ).toContain(9);
    });

    it('prefers the race-specific override over the baseline', async () => {
      const db = mockDb([
        { raceId: null, sppValue: 3 },
        { raceId: 7, sppValue: 2 },
      ]);
      const service = await makeService(db);

      const value = await service.resolveSppValue({
        actingPlayerId: 9,
        actionType: 'touchdown',
      });

      expect(value).toBe(2);
    });

    it('returns undefined when the award table has no matching row', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      const value = await service.resolveSppValue({
        actingPlayerId: 9,
        actionType: 'deflection',
      });

      expect(value).toBeUndefined();
    });

    it('returns a zero award as 0, not as "no value"', async () => {
      const db = mockDb([{ raceId: null, sppValue: 0 }]);
      const service = await makeService(db);

      const value = await service.resolveSppValue({
        actingPlayerId: 9,
        actionType: 'completion',
      });

      expect(value).toBe(0);
    });
  });
});

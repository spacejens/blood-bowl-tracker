import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SppAwardValueValidationError } from '../shared/spp-award-value-validation-error';
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

    it('looks up the rules sets, races and existing rows the batch names', async () => {
      // Query 0: rules sets 1 and 2 exist. Query 1: race 7 exists. Query 2:
      // the existing-rows lookup. Query 3: the insert.
      const db = mockDb(
        [{ id: 1 }, { id: 2 }],
        [{ id: 7 }],
        [],
        [{ id: 11 }, { id: 12 }, { id: 13 }],
      );
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
      expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        7,
      ]);
      expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        1, 2,
      ]);
    });

    it('skips the race lookup when every value is a baseline', async () => {
      // Query 0: the rules set exists. Query 1: existing rows. Query 2: insert.
      const db = mockDb([{ id: 1 }], [], [{ id: 11 }]);
      const service = await makeService(db);

      await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        ],
      });

      expect(db.chains).toHaveLength(3);
      expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        1,
      ]);
    });

    it('bulk-inserts rows with no existing match and returns their ids', async () => {
      // Queries 0-1: references. Query 2: the existing-rows lookup (nothing
      // there). Query 3: the insert.
      const db = mockDb([{ id: 1 }], [{ id: 7 }], [], [{ id: 11 }, { id: 12 }]);
      const service = await makeService(db);

      const result = await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
          { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
        ],
      });

      expect(result).toEqual({ sppAwardValueIds: [11, 12] });
      expect(db.chains).toHaveLength(4);
      expect(firstCallArg(db.chains[3].values)).toEqual([
        { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
      ]);
      expect(db.chains[3].onConflictDoUpdate).not.toHaveBeenCalled();
    });

    it('updates matched rows by id instead of inserting them', async () => {
      // Queries 0-1: references. Query 2: the lookup finds both rows.
      // Queries 3 and 4: one UPDATE each.
      const db = mockDb(
        [{ id: 1 }],
        [{ id: 7 }],
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
      // References, lookup, two updates, and no insert statement at all.
      expect(db.chains).toHaveLength(5);
      expect(firstCallArg(db.chains[3].set)).toEqual({ sppValue: 4 });
      expect(extractAllFilterValues(firstCallArg(db.chains[3].where))).toEqual([
        11,
      ]);
      expect(firstCallArg(db.chains[4].set)).toEqual({ sppValue: 5 });
      expect(extractAllFilterValues(firstCallArg(db.chains[4].where))).toEqual([
        12,
      ]);
    });

    it('matches a baseline row on its null raceId rather than treating it as new', async () => {
      const db = mockDb(
        [{ id: 1 }],
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
      expect(db.chains).toHaveLength(3);
      expect(firstCallArg(db.chains[2].set)).toEqual({ sppValue: 4 });
    });

    it('splits a mixed batch into one insert and one update', async () => {
      // Queries 0-1: references. Query 2: lookup finds only the baseline row.
      // Query 3: insert the new race-specific row. Query 4: update the
      // matched baseline row.
      const db = mockDb(
        [{ id: 1 }],
        [{ id: 7 }],
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
      expect(firstCallArg(db.chains[3].values)).toEqual([
        { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
      ]);
      expect(extractAllFilterValues(firstCallArg(db.chains[4].where))).toEqual([
        11,
      ]);
    });

    it('does not match a row from a different rules set or action type', async () => {
      // Query 0: the rules set. No race lookup (baseline only). Query 1:
      // existing rows. Query 2: the insert.
      const db = mockDb(
        [{ id: 1 }],
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
      expect(db.chains).toHaveLength(3);
      expect(firstCallArg(db.chains[2].values)).toEqual([
        { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
      ]);
    });

    it('performs the writes inside a single transaction', async () => {
      const db = mockDb([{ id: 1 }], [], [{ id: 11 }]);
      const service = await makeService(db);

      await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        ],
      });

      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('propagates a failing transaction rather than reporting a partial write', async () => {
      const db = mockDb([{ id: 1 }], []);
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

    it('rejects a batch naming the same key twice, before any query', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const promise = service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 4 },
        ],
      });

      await expect(promise).rejects.toBeInstanceOf(
        SppAwardValueValidationError,
      );
      await expect(promise).rejects.toThrow(
        'The touchdown award under rules set 1 for the baseline (no race) appears more than once in the same batch',
      );
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('names the race of a repeated race-specific key', async () => {
      const db = mockDb();
      const service = await makeService(db);

      await expect(
        service.sync({
          values: [
            { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
            { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 3 },
          ],
        }),
      ).rejects.toThrow(
        'The touchdown award under rules set 1 for race 7 appears more than once in the same batch',
      );
    });

    it('rejects a value naming a rules set that does not exist, writing nothing', async () => {
      const db = mockDb([], [{ id: 7 }]);
      const service = await makeService(db);

      const promise = service.sync({
        values: [
          { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
        ],
      });

      await expect(promise).rejects.toBeInstanceOf(
        SppAwardValueValidationError,
      );
      await expect(promise).rejects.toThrow(
        'Rules set 1 does not exist, so no SPP award value can be recorded under it',
      );
      expect(db.chains).toHaveLength(2);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects a value naming a race that does not exist, writing nothing', async () => {
      const db = mockDb([{ id: 1 }], []);
      const service = await makeService(db);

      const promise = service.sync({
        values: [
          { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
        ],
      });

      await expect(promise).rejects.toBeInstanceOf(
        SppAwardValueValidationError,
      );
      await expect(promise).rejects.toThrow(
        'Race 7 does not exist, so no SPP award value can be recorded for it',
      );
      expect(db.chains).toHaveLength(2);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('validates the whole batch before any write, even when the bad value is last', async () => {
      // Only the rules-set lookup runs (both values are baselines); rules set
      // 2 is missing, so the existing-rows lookup never runs.
      const db = mockDb([{ id: 1 }]);
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
            {
              rulesSetId: 2,
              raceId: null,
              actionType: 'touchdown',
              sppValue: 3,
            },
          ],
        }),
      ).rejects.toThrow(/Rules set 2 does not exist/);
      expect(db.chains).toHaveLength(1);
      expect(db.transaction).not.toHaveBeenCalled();
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

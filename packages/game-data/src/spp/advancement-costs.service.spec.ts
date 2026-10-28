import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AdvancementCostValidationError } from '../shared/advancement-cost-validation-error';
import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { AdvancementCostsService } from './advancement-costs.service';

async function makeService(db: MockDbResult): Promise<AdvancementCostsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [AdvancementCostsService, { provide: DB, useValue: db.db }],
  }).compile();
  return moduleRef.get(AdvancementCostsService);
}

function cost(advancementNumber: number, sppCost: number, rulesSetId = 1) {
  return {
    rulesSetId,
    advancementNumber,
    advancementKind: 'table_roll' as const,
    sppCost,
  };
}

function existingRow(id: number, advancementNumber: number, rulesSetId = 1) {
  return { id, rulesSetId, advancementNumber, advancementKind: 'table_roll' };
}

describe('AdvancementCostsService', () => {
  describe('sync', () => {
    it('returns no ids and issues no query for an empty costs list', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const result = await service.sync({ costs: [] });

      expect(result).toEqual({ advancementCostIds: [] });
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('looks up the rules sets and existing rows the batch names', async () => {
      // Query 0: rules sets 1 and 2 exist. Query 1: existing rows. Query 2:
      // the insert.
      const db = mockDb([{ id: 1 }, { id: 2 }], [], [{ id: 11 }, { id: 12 }]);
      const service = await makeService(db);

      await service.sync({ costs: [cost(1, 6, 1), cost(1, 6, 2)] });

      expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
        1, 2,
      ]);
      expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        1, 2,
      ]);
    });

    it('bulk-inserts costs with no existing row and returns their ids', async () => {
      const db = mockDb([{ id: 1 }], [], [{ id: 11 }, { id: 12 }]);
      const service = await makeService(db);

      const result = await service.sync({ costs: [cost(1, 6), cost(2, 10)] });

      expect(result).toEqual({ advancementCostIds: [11, 12] });
      expect(db.chains).toHaveLength(3);
      expect(firstCallArg(db.chains[2].values)).toEqual([
        cost(1, 6),
        cost(2, 10),
      ]);
      expect(db.chains[2].onConflictDoUpdate).not.toHaveBeenCalled();
    });

    it('updates matched rows by id instead of inserting them', async () => {
      // Query 0: reference. Query 1: lookup finds both rows. Queries 2-3: one
      // UPDATE each, and no insert statement at all.
      const db = mockDb(
        [{ id: 1 }],
        [existingRow(11, 1), existingRow(12, 2)],
        [{ id: 11 }],
        [{ id: 12 }],
      );
      const service = await makeService(db);

      const result = await service.sync({ costs: [cost(1, 7), cost(2, 11)] });

      expect(result).toEqual({ advancementCostIds: [11, 12] });
      expect(db.chains).toHaveLength(4);
      expect(firstCallArg(db.chains[2].set)).toEqual({ sppCost: 7 });
      expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        11,
      ]);
      expect(firstCallArg(db.chains[3].set)).toEqual({ sppCost: 11 });
      expect(extractAllFilterValues(firstCallArg(db.chains[3].where))).toEqual([
        12,
      ]);
    });

    it('does not match a row with a different advancement number or rules set', async () => {
      const db = mockDb(
        [{ id: 1 }],
        [existingRow(11, 2), existingRow(12, 1, 9)],
        [{ id: 13 }],
      );
      const service = await makeService(db);

      const result = await service.sync({ costs: [cost(1, 6)] });

      expect(result).toEqual({ advancementCostIds: [13] });
      expect(firstCallArg(db.chains[2].values)).toEqual([cost(1, 6)]);
    });

    it('performs the writes inside a single transaction', async () => {
      const db = mockDb([{ id: 1 }], [], [{ id: 11 }]);
      const service = await makeService(db);

      await service.sync({ costs: [cost(1, 6)] });

      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('propagates a failing transaction rather than reporting a partial write', async () => {
      const db = mockDb([{ id: 1 }], []);
      db.transaction.mockRejectedValue(new Error('connection lost'));
      const service = await makeService(db);

      await expect(service.sync({ costs: [cost(1, 6)] })).rejects.toThrow(
        'connection lost',
      );
    });

    it('rejects a batch naming the same key twice, before any query', async () => {
      const db = mockDb();
      const service = await makeService(db);

      const promise = service.sync({ costs: [cost(1, 6), cost(1, 7)] });

      await expect(promise).rejects.toBeInstanceOf(
        AdvancementCostValidationError,
      );
      await expect(promise).rejects.toThrow(
        'The table_roll cost of advancement 1 under rules set 1 appears more than once in the same batch',
      );
      expect(db.chains).toHaveLength(0);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects a cost naming a rules set that does not exist, writing nothing', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      const promise = service.sync({ costs: [cost(1, 6)] });

      await expect(promise).rejects.toBeInstanceOf(
        AdvancementCostValidationError,
      );
      await expect(promise).rejects.toThrow(
        'Rules set 1 does not exist, so no advancement cost can be recorded under it',
      );
      expect(db.chains).toHaveLength(1);
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });
});

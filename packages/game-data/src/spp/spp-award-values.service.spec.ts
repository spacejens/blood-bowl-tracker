import { DB, sppAwardValues } from '@blood-bowl-tracker/db';
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
    });

    it('inserts the supplied rows and returns the resulting ids', async () => {
      const db = mockDb([{ id: 11 }, { id: 12 }]);
      const service = await makeService(db);

      const result = await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
          { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
        ],
      });

      expect(result).toEqual({ sppAwardValueIds: [11, 12] });
      expect(firstCallArg(db.chains[0].values)).toEqual([
        { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        { rulesSetId: 1, raceId: 7, actionType: 'touchdown', sppValue: 2 },
      ]);
    });

    it('updates spp_value on conflict rather than creating a duplicate row', async () => {
      const db = mockDb([{ id: 11 }]);
      const service = await makeService(db);

      await service.sync({
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        ],
      });

      const conflict = firstCallArg(db.chains[0].onConflictDoUpdate) as {
        target: unknown[];
        set: Record<string, unknown>;
      };
      expect(conflict.target).toEqual([
        sppAwardValues.rulesSetId,
        sppAwardValues.raceId,
        sppAwardValues.actionType,
      ]);
      expect(Object.keys(conflict.set)).toEqual(['sppValue']);
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

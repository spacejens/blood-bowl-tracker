import type { Db } from '@blood-bowl-tracker/db';
import { DB, eraRulesSets, eras } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ErasService, EraUpsertConflictError } from './eras.service';

const fakeEra = {
  id: 1,
  name: 'BB2020',
  leagueId: 10,
  startDate: '2021-09-01',
  endDate: '2023-06-10',
  createdAt: new Date('2026-01-01'),
};

describe('ErasService', () => {
  let service: ErasService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [ErasService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(ErasService);
    return { db, chains };
  }

  const baseData = {
    name: 'BB2020',
    leagueId: 10,
    rulesSetIds: [20, 21],
    startDate: '2021-09-01',
    endDate: '2023-06-10',
    externalIds: [
      { externalSystemId: 1, externalId: 'BB2020' },
      { externalSystemId: 2, externalId: 'BB2020' },
    ],
  };

  describe('upsert', () => {
    it('creates a new era with its rules sets when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: both external IDs are new and get
      // inserted; query 3: no existing rules-set links; query 4: both
      // rules-set links are new and get inserted.
      const { db, chains } = await build([], [fakeEra]);

      const result = await service.upsert(baseData);

      expect(result).toEqual({
        era: { ...fakeEra, rulesSetIds: [20, 21] },
        created: true,
      });
      expect(firstCallArg(chains[1].values)).toEqual({
        name: 'BB2020',
        leagueId: 10,
        startDate: '2021-09-01',
        endDate: '2023-06-10',
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it('omits endDate from the insert when the payload omits it', async () => {
      const { chains } = await build([], [fakeEra]);

      await service.upsert({ ...baseData, endDate: undefined });

      expect(firstCallArg(chains[1].values)).toEqual({
        name: 'BB2020',
        leagueId: 10,
        startDate: '2021-09-01',
      });
    });

    it('leaves a stored endDate alone on update when the payload omits it', async () => {
      // query 0: the external-id lookup matches era 1; query 1: the update.
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'BB2020' }],
        [fakeEra],
      );

      await service.upsert({ ...baseData, endDate: undefined });

      expect(firstCallArg(chains[1].set)).toEqual({
        name: 'BB2020',
        leagueId: 10,
        startDate: '2021-09-01',
      });
    });

    it('writes null on update when the payload explicitly clears endDate', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'BB2020' }],
        [fakeEra],
      );

      await service.upsert({ ...baseData, endDate: null });

      expect(firstCallArg(chains[1].set)).toMatchObject({ endDate: null });
    });

    it('updates the matching era when exactly one external ID matches', async () => {
      const { db } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: 'BB2020' }],
        [fakeEra],
      );

      const result = await service.upsert(baseData);

      expect(result.created).toBe(false);
      expect(db.update).toHaveBeenCalledWith(eras);
    });

    it('throws EraUpsertConflictError when external IDs match different eras', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: 'BB2020' },
        { ownerId: 2, externalSystemId: 2, externalId: 'BB2020' },
      ]);

      await expect(service.upsert(baseData)).rejects.toThrow(
        EraUpsertConflictError,
      );
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('inserts only the era_rules_sets rows that are new', async () => {
      const { chains } = await build([], [fakeEra], [], [{ rulesSetId: 20 }]);

      const result = await service.upsert(baseData);

      expect(firstCallArg(chains[4].values)).toEqual([
        { eraId: 1, rulesSetId: 21 },
      ]);
      expect(result.era.rulesSetIds).toEqual([20, 21]);
    });

    it('does not insert era_rules_sets rows when all links already exist', async () => {
      const { db, chains } = await build(
        [],
        [fakeEra],
        [],
        [{ rulesSetId: 20 }, { rulesSetId: 21 }],
      );

      const result = await service.upsert(baseData);

      expect(chains).toHaveLength(4);
      expect(db.insert).not.toHaveBeenCalledWith(eraRulesSets);
      expect(result.era.rulesSetIds).toEqual([20, 21]);
    });
  });

  describe('listByRulesSetAndExternalSystem', () => {
    it('lists the distinct eras declaring the rules set that carry an id under the system', async () => {
      const rows = [
        { id: 3, name: 'Fourth era' },
        { id: 5, name: 'Fifth era' },
      ];
      const { db, chains } = await build(rows);

      await expect(
        service.listByRulesSetAndExternalSystem({
          rulesSetId: 20,
          externalSystemId: 1,
        }),
      ).resolves.toEqual(rows);

      expect(db.selectDistinct).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['eras.id', 'era_rules_sets.era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras_external_ids.era_id', 'eras.id']);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        20, 1,
      ]);
      expect(chains[0].orderBy).toHaveBeenCalledWith(eras.id);
    });

    it('answers an empty list when no era qualifies', async () => {
      await build([]);

      await expect(
        service.listByRulesSetAndExternalSystem({
          rulesSetId: 20,
          externalSystemId: 1,
        }),
      ).resolves.toEqual([]);
    });
  });
});

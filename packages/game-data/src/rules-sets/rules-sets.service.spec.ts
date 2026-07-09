import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RulesSetsService,
  RulesSetUpsertConflictError,
} from './rules-sets.service';

const fakeRulesSet = {
  id: 1,
  name: 'BB2020',
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

describe('RulesSetsService', () => {
  let service: RulesSetsService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeRulesSet])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeRulesSet]),
      })),
    };
    const updateChain = {
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([fakeRulesSet]),
        })),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
    };

    const module = await Test.createTestingModule({
      providers: [RulesSetsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(RulesSetsService);
  });

  describe('upsert', () => {
    const externalIds = [
      { externalSystemId: 1, externalId: 'BB2020' },
      { externalSystemId: 2, externalId: 'BB2020' },
    ];

    it('creates a new rules set when no external IDs match', async () => {
      mockDb.select().from.mockReturnValue(makeFromBuilder([]));

      const result = await service.upsert({ name: 'BB2020', externalIds });

      expect(result).toEqual({ rulesSet: fakeRulesSet, created: true });
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('updates the matching rules set when exactly one external ID matches', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { rulesSetId: 1, externalSystemId: 1, externalId: 'BB2020' },
          ]),
        );

      const result = await service.upsert({ name: 'BB2020', externalIds });

      expect(result).toEqual({ rulesSet: fakeRulesSet, created: false });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('throws RulesSetUpsertConflictError when external IDs match different rules sets', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { rulesSetId: 1, externalSystemId: 1, externalId: 'BB2020' },
          { rulesSetId: 2, externalSystemId: 2, externalId: 'BB2020' },
        ]),
      );

      await expect(
        service.upsert({ name: 'BB2020', externalIds }),
      ).rejects.toThrow(RulesSetUpsertConflictError);
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched rules set', async () => {
      mockDb.select().from.mockReturnValue(
        makeFromBuilder([
          { rulesSetId: 1, externalSystemId: 1, externalId: 'BB2020' },
          { rulesSetId: 1, externalSystemId: 2, externalId: 'BB2020' },
        ]),
      );

      await service.upsert({ name: 'BB2020', externalIds });

      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing rules set', async () => {
      mockDb
        .select()
        .from.mockReturnValue(
          makeFromBuilder([
            { rulesSetId: 1, externalSystemId: 1, externalId: 'BB2020' },
          ]),
        );
      const insertValues = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeRulesSet]),
      }));
      mockDb.insert.mockReturnValue({ values: insertValues });

      await service.upsert({ name: 'BB2020', externalIds });

      expect(insertValues).toHaveBeenCalledWith([
        { rulesSetId: 1, externalSystemId: 2, externalId: 'BB2020' },
      ]);
    });
  });
});

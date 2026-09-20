import {
  KeywordUpsertConflictError,
  KeywordValidationError,
} from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

const keyword = {
  id: 7,
  name: 'Goblin',
  kind: 'species' as const,
  createdAt: new Date('2026-01-01'),
};

// The db row carries history-tracking columns the contract's KeywordSchema
// does not; the mock must supply them to satisfy KeywordsService's return
// type, but the expectations below only assert on what the contract carries.
const keywordRow = {
  ...keyword,
  updatedAt: new Date('2026-01-01'),
  historyVersion: 1,
  historyPeriod: '["2026-01-01 00:00:00+00",)',
};

describe('RpcRouterFactoryService keywords routers', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('flattens a created keyword and its created flag into the upsert response', async () => {
    harness.mocks.keywordsService.upsert.mockResolvedValue({
      keyword: keywordRow,
      created: true,
    });

    const result = await call(harness.router.keywords.upsert, {
      name: 'Goblin',
      kind: 'species',
      externalIds: [{ externalSystemId: 1, externalId: '111' }],
    });

    expect(result).toEqual({ ...keyword, created: true });
  });

  it('maps a keyword upsert conflict to CONFLICT', async () => {
    harness.mocks.keywordsService.upsert.mockRejectedValue(
      new KeywordUpsertConflictError('clash'),
    );

    await expect(
      call(harness.router.keywords.upsert, {
        name: 'Goblin',
        kind: 'species',
        externalIds: [{ externalSystemId: 1, externalId: '111' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'clash',
    });
  });

  it('upsertBatch reports a conflicting item without failing its siblings', async () => {
    harness.mocks.keywordsService.upsert
      .mockRejectedValueOnce(new KeywordUpsertConflictError('clash'))
      .mockResolvedValueOnce({ keyword: keywordRow, created: true });

    const result = await call(harness.router.keywords.upsertBatch, [
      {
        name: 'Goblin',
        kind: 'species',
        externalIds: [{ externalSystemId: 1, externalId: '111' }],
      },
      {
        name: 'Goblin',
        kind: 'species',
        externalIds: [{ externalSystemId: 1, externalId: '112' }],
      },
    ]);

    expect(result).toEqual([
      { success: false, error: 'clash' },
      { ...keyword, success: true, created: true },
    ]);
  });

  it('answers a resolve with what the service found', async () => {
    harness.mocks.keywordsService.resolve.mockResolvedValue({
      found: true,
      id: 7,
    });

    await expect(
      call(harness.router.keywords.resolve, {
        externalSystemId: 1,
        externalId: '111',
      }),
    ).resolves.toEqual({ found: true, id: 7 });
    expect(harness.mocks.keywordsService.resolve).toHaveBeenCalledWith({
      externalSystemId: 1,
      externalId: '111',
    });
  });

  it('answers a resolveBatch index-aligned with the request', async () => {
    const input = [
      { externalSystemId: 1, externalId: '111' },
      { externalSystemId: 1, externalId: '999' },
    ];
    harness.mocks.keywordsService.resolveBatch.mockResolvedValue([
      { found: true, id: 7 },
      { found: false },
    ]);

    await expect(
      call(harness.router.keywords.resolveBatch, input),
    ).resolves.toEqual([{ found: true, id: 7 }, { found: false }]);
    expect(harness.mocks.keywordsService.resolveBatch).toHaveBeenCalledWith(
      input,
    );
  });

  it('lists the catalogue for one external system', async () => {
    harness.mocks.keywordsService.listByExternalSystem.mockResolvedValue([
      { keywordId: 7, name: 'Goblin', kind: 'species', externalId: '111' },
    ]);

    const result = await call(harness.router.keywords.list, {
      externalSystemId: 2,
    });

    expect(
      harness.mocks.keywordsService.listByExternalSystem,
    ).toHaveBeenCalledWith(2);
    expect(result).toEqual([
      { keywordId: 7, name: 'Goblin', kind: 'species', externalId: '111' },
    ]);
  });

  it('syncs position keywords straight through to the service', async () => {
    harness.mocks.positionRulesSetKeywordsService.sync.mockResolvedValue({
      positionRulesSetKeywordIds: [90],
    });

    const result = await call(harness.router.positionRulesSetKeywords.sync, {
      entries: [{ positionId: 3, rulesSetId: 4, keywordId: 7 }],
    });

    expect(result).toEqual({ positionRulesSetKeywordIds: [90] });
  });

  it('maps a KeywordValidationError to BAD_REQUEST', async () => {
    harness.mocks.positionRulesSetKeywordsService.sync.mockRejectedValue(
      new KeywordValidationError(
        'Position 3 has no characteristics recorded under rules set 4, so it cannot carry keywords there',
      ),
    );

    await expect(
      call(harness.router.positionRulesSetKeywords.sync, {
        entries: [{ positionId: 3, rulesSetId: 4, keywordId: 7 }],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'Position 3 has no characteristics recorded under rules set 4, so it cannot carry keywords there',
    });
  });

  it("lists a position's keywords without the rules set name the contract does not carry", async () => {
    harness.mocks.positionRulesSetKeywordsService.listByPosition.mockResolvedValue(
      [
        {
          rulesSetId: 2,
          rulesSetName: 'BB2025',
          keywordId: 3,
          keywordName: 'Goblin',
          kind: 'species',
        },
      ],
    );

    const result = await call(harness.router.positionRulesSetKeywords.list, {
      positionId: 5,
    });

    expect(
      harness.mocks.positionRulesSetKeywordsService.listByPosition,
    ).toHaveBeenCalledWith(5);
    expect(result).toEqual([
      { rulesSetId: 2, keywordId: 3, keywordName: 'Goblin', kind: 'species' },
    ]);
  });
});

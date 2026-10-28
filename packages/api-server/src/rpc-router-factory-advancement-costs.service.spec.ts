import { AdvancementCostValidationError } from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

const input = {
  costs: [
    {
      rulesSetId: 1,
      advancementNumber: 1,
      advancementKind: 'table_roll' as const,
      sppCost: 6,
    },
  ],
};

describe('RpcRouterFactoryService advancementCosts router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('routes advancementCosts.sync to AdvancementCostsService.sync', async () => {
    harness.mocks.advancementCostsService.sync.mockResolvedValue({
      advancementCostIds: [11],
    });

    const result = await call(harness.router.advancementCosts.sync, input);

    expect(result).toEqual({ advancementCostIds: [11] });
    expect(harness.mocks.advancementCostsService.sync).toHaveBeenCalledWith(
      input,
    );
  });

  it('reports a rejected batch as BAD_REQUEST with the service message', async () => {
    harness.mocks.advancementCostsService.sync.mockRejectedValue(
      new AdvancementCostValidationError(
        'Rules set 1 does not exist, so no advancement cost can be recorded under it',
      ),
    );

    await expect(
      call(harness.router.advancementCosts.sync, input),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'Rules set 1 does not exist, so no advancement cost can be recorded under it',
    });
  });

  it('lets an unrelated advancement cost failure through untouched', async () => {
    harness.mocks.advancementCostsService.sync.mockRejectedValue(
      new Error('connection lost'),
    );

    await expect(
      call(harness.router.advancementCosts.sync, input),
    ).rejects.toThrow('connection lost');
  });

  it('rejects a non-positive SPP cost at the contract boundary', async () => {
    await expect(
      call(harness.router.advancementCosts.sync, {
        costs: [{ ...input.costs[0], sppCost: 0 }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(harness.mocks.advancementCostsService.sync).not.toHaveBeenCalled();
  });
});

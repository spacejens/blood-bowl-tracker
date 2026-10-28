import { PositionSkillCategoryValidationError } from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

const input = {
  entries: [
    {
      positionId: 1,
      rulesSetId: 2,
      primary: ['general' as const],
      secondary: ['agility' as const],
    },
  ],
};

describe('RpcRouterFactoryService positionRulesSetSkillCategories router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('routes sync to PositionRulesSetSkillCategoriesService.sync', async () => {
    harness.mocks.positionRulesSetSkillCategoriesService.sync.mockResolvedValue(
      { positionRulesSetSkillCategoryIds: [70, 71] },
    );

    const result = await call(
      harness.router.positionRulesSetSkillCategories.sync,
      input,
    );

    expect(result).toEqual({ positionRulesSetSkillCategoryIds: [70, 71] });
    expect(
      harness.mocks.positionRulesSetSkillCategoriesService.sync,
    ).toHaveBeenCalledWith(input);
  });

  it('reports a rejected batch as BAD_REQUEST with the service message', async () => {
    harness.mocks.positionRulesSetSkillCategoriesService.sync.mockRejectedValue(
      new PositionSkillCategoryValidationError(
        'Position 1 under rules set 2 cannot take skill category trait',
      ),
    );

    await expect(
      call(harness.router.positionRulesSetSkillCategories.sync, input),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Position 1 under rules set 2 cannot take skill category trait',
    });
  });

  it('lets an unrelated failure through untouched', async () => {
    harness.mocks.positionRulesSetSkillCategoriesService.sync.mockRejectedValue(
      new Error('connection lost'),
    );

    await expect(
      call(harness.router.positionRulesSetSkillCategories.sync, input),
    ).rejects.toThrow('connection lost');
  });
});

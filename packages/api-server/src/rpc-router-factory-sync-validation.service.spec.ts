import { PositionValidationError } from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

/**
 * The sync routes whose services reject a bad batch with a
 * SyncBatchValidationError subclass, checked end to end through the real
 * router and the real UpsertHandlerService: the rejection must reach the
 * caller as BAD_REQUEST, carrying the service's message.
 */
describe('RpcRouterFactoryService sync batch validation', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('reports a position rules-set pair named twice as BAD_REQUEST', async () => {
    harness.mocks.positionRulesSetsService.sync.mockRejectedValue(
      new PositionValidationError(
        'Position 3 under rules set 4 appears more than once in the same batch',
      ),
    );

    await expect(
      call(harness.router.positionRulesSets.sync, { entries: [] }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'Position 3 under rules set 4 appears more than once in the same batch',
    });
  });
});

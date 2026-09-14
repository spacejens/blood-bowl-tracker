import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

describe('RpcRouterFactoryService players.syncLastingInjuryHistory', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('routes straight to PlayerLastingInjuryBackfillService', async () => {
    harness.mocks.playerLastingInjuryBackfillService.syncLastingInjuryHistory.mockResolvedValue(
      { backfilledPlayerIds: [7, 9] },
    );

    const result = await call(harness.router.players.syncLastingInjuryHistory, {
      playerIds: [7, 8, 9],
    });

    expect(
      harness.mocks.playerLastingInjuryBackfillService.syncLastingInjuryHistory,
    ).toHaveBeenCalledWith({ playerIds: [7, 8, 9] });
    expect(result).toEqual({ backfilledPlayerIds: [7, 9] });
  });

  it('passes an empty list straight through', async () => {
    harness.mocks.playerLastingInjuryBackfillService.syncLastingInjuryHistory.mockResolvedValue(
      { backfilledPlayerIds: [] },
    );

    const result = await call(harness.router.players.syncLastingInjuryHistory, {
      playerIds: [],
    });

    expect(result).toEqual({ backfilledPlayerIds: [] });
  });
});

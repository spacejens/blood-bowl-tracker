import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

describe('RpcRouterFactoryService races router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it("lists a race's ongoing eras", async () => {
    const rows = [{ id: 5, name: 'Fifth era' }];
    harness.mocks.racesService.listOngoingEras.mockResolvedValue(rows);

    const result = await call(harness.router.races.listOngoingEras, {
      raceId: 7,
    });

    expect(result).toEqual(rows);
    expect(harness.mocks.racesService.listOngoingEras).toHaveBeenCalledWith(7);
  });
});

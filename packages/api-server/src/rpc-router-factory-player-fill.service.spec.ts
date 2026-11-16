import type { FillIncompletePlayer } from '@blood-bowl-tracker/api-contract';
import { IncompletePlayerFillError } from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

const fill: FillIncompletePlayer = {
  playerId: 9,
  status: 'active',
  characteristics: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
  sppTotal: 8,
  unspentSpp: 2,
  startingSkills: [],
  advancements: [],
};

describe('RpcRouterFactoryService players.fillIncomplete router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('fills the player through the service', async () => {
    harness.mocks.playerFillService.fill.mockResolvedValue({
      playerId: 9,
      outcome: 'filled',
    });

    const result = await call(harness.router.players.fillIncomplete, fill);

    expect(harness.mocks.playerFillService.fill).toHaveBeenCalledWith(fill);
    expect(result).toEqual({ playerId: 9, outcome: 'filled' });
  });

  it('reports a refused fill as BAD_REQUEST', async () => {
    harness.mocks.playerFillService.fill.mockRejectedValue(
      new IncompletePlayerFillError('Player 9 is a star player'),
    );

    await expect(
      call(harness.router.players.fillIncomplete, fill),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Player 9 is a star player',
    });
  });
});

describe('RpcRouterFactoryService players.recordLastingReductions router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('records the reductions through the service', async () => {
    harness.mocks.playerFillReductionsRecordService.record.mockResolvedValue({
      playerId: 9,
      outcome: 'recorded',
    });

    const result = await call(harness.router.players.recordLastingReductions, {
      playerId: 9,
    });

    expect(
      harness.mocks.playerFillReductionsRecordService.record,
    ).toHaveBeenCalledWith({ playerId: 9 });
    expect(result).toEqual({ playerId: 9, outcome: 'recorded' });
  });

  it('reports a refusal as BAD_REQUEST', async () => {
    harness.mocks.playerFillReductionsRecordService.record.mockRejectedValue(
      new IncompletePlayerFillError(
        'Player 9 is still incomplete: fill him in before recording his lasting reductions',
      ),
    );

    await expect(
      call(harness.router.players.recordLastingReductions, { playerId: 9 }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'Player 9 is still incomplete: fill him in before recording his lasting reductions',
    });
  });
});

import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

describe('RpcRouterFactoryService positionRulesSets router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it("lists one position's stat lines without the fields the contract does not carry", async () => {
    // listByPosition also returns rulesSetName and the five *Format columns;
    // the contract's output schema carries neither, so they do not reach the
    // caller — the same stripping the upsert routes rely on for a row's
    // history-tracking columns.
    harness.mocks.positionRulesSetsService.listByPosition.mockResolvedValue([
      {
        rulesSetId: 900,
        rulesSetName: 'BB2020',
        moveFormat: 'bare',
        move: 6,
        strengthFormat: 'bare',
        strength: 7,
        agilityFormat: 'plus',
        agility: 5,
        passingFormat: 'plus_zero_legal',
        passing: 5,
        armourFormat: 'plus',
        armour: 11,
      },
    ]);

    const result = await call(harness.router.positionRulesSets.list, {
      positionId: 42,
    });

    expect(
      harness.mocks.positionRulesSetsService.listByPosition,
    ).toHaveBeenCalledWith(42);
    expect(result).toEqual([
      {
        rulesSetId: 900,
        move: 6,
        strength: 7,
        agility: 5,
        passing: 5,
        armour: 11,
      },
    ]);
  });

  it('returns an empty array for a position with no stat lines', async () => {
    harness.mocks.positionRulesSetsService.listByPosition.mockResolvedValue([]);

    const result = await call(harness.router.positionRulesSets.list, {
      positionId: 42,
    });

    expect(result).toEqual([]);
  });
});

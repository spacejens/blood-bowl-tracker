import {
  PositionValidationError,
  SppAwardValueValidationError,
} from '@blood-bowl-tracker/game-data';
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

  it('reports a rejected SPP award value batch as BAD_REQUEST', async () => {
    harness.mocks.sppAwardValuesService.sync.mockRejectedValue(
      new SppAwardValueValidationError(
        'Rules set 1 does not exist, so no SPP award value can be recorded under it',
      ),
    );

    await expect(
      call(harness.router.sppAwardValues.sync, {
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'Rules set 1 does not exist, so no SPP award value can be recorded under it',
    });
  });

  it('lets an unrelated SPP award value failure through untouched', async () => {
    harness.mocks.sppAwardValuesService.sync.mockRejectedValue(
      new Error('connection lost'),
    );

    await expect(
      call(harness.router.sppAwardValues.sync, {
        values: [
          { rulesSetId: 1, raceId: null, actionType: 'touchdown', sppValue: 3 },
        ],
      }),
    ).rejects.toThrow('connection lost');
  });

  it('reports a rejected race-era sync as BAD_REQUEST', async () => {
    harness.mocks.positionsService.syncRaceEras.mockRejectedValue(
      new PositionValidationError(
        'Race 7 is not available in era 2 (no race_eras row), so position 1 cannot be made available there',
      ),
    );

    await expect(
      call(harness.router.positions.syncRaceEras, {
        positionId: 1,
        raceEras: [{ raceId: 7, eraId: 2 }],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'Race 7 is not available in era 2 (no race_eras row), so position 1 cannot be made available there',
    });
  });

  it('lets an unrelated race-era sync failure through untouched', async () => {
    harness.mocks.positionsService.syncRaceEras.mockRejectedValue(
      new Error('connection lost'),
    );

    await expect(
      call(harness.router.positions.syncRaceEras, {
        positionId: 1,
        raceEras: [{ raceId: 7, eraId: 2 }],
      }),
    ).rejects.toThrow('connection lost');
  });
});

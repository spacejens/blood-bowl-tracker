import {
  TrophyAwardRecipientMismatchError,
  TrophyAwardUpsertConflictError,
} from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

const upsertInput = {
  trophyId: 1,
  competitionId: 2,
  teamEraId: 3,
  playerId: 4,
};

describe('RpcRouterFactoryService trophyAwards router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('flattens the upserted award and its created flag', async () => {
    const trophyAward = {
      id: 7,
      trophyId: 1,
      competitionId: 2,
      teamEraId: 3,
      playerId: 4,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      historyVersion: 1,
      historyPeriod: '["2026-01-01 00:00:00+00",)',
    };
    harness.mocks.trophyAwardsService.upsert.mockResolvedValue({
      trophyAward,
      created: true,
    });

    const result = await call(harness.router.trophyAwards.upsert, upsertInput);

    expect(result).toEqual({
      id: 7,
      trophyId: 1,
      competitionId: 2,
      teamEraId: 3,
      playerId: 4,
      createdAt: trophyAward.createdAt,
      created: true,
    });
    expect(harness.mocks.trophyAwardsService.upsert).toHaveBeenCalledWith(
      upsertInput,
    );
  });

  it('translates an upsert conflict into CONFLICT', async () => {
    harness.mocks.trophyAwardsService.upsert.mockRejectedValue(
      new TrophyAwardUpsertConflictError('two rows'),
    );

    await expect(
      call(harness.router.trophyAwards.upsert, upsertInput),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'two rows' });
  });

  it('translates a recipient-kind mismatch into BAD_REQUEST', async () => {
    harness.mocks.trophyAwardsService.upsert.mockRejectedValue(
      new TrophyAwardRecipientMismatchError('wrong recipient'),
    );

    await expect(
      call(harness.router.trophyAwards.upsert, upsertInput),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'wrong recipient',
    });
  });
});

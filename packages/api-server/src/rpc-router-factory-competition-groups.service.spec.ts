import { CompetitionGroupUpsertConflictError } from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

describe('RpcRouterFactoryService competitionGroups router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('flattens the upserted group and its created flag', async () => {
    const competitionGroup = {
      id: 3,
      name: 'Chaos Cup',
      leagueId: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      historyVersion: 1,
      historyPeriod: '["2026-01-01 00:00:00+00",)',
    };
    harness.mocks.competitionGroupsService.upsert.mockResolvedValue({
      competitionGroup,
      created: true,
    });

    const result = await call(harness.router.competitionGroups.upsert, {
      name: 'Chaos Cup',
      leagueId: 1,
    });

    expect(result).toEqual({
      id: 3,
      name: 'Chaos Cup',
      leagueId: 1,
      createdAt: competitionGroup.createdAt,
      created: true,
    });
  });

  it('translates an upsert conflict into CONFLICT', async () => {
    harness.mocks.competitionGroupsService.upsert.mockRejectedValue(
      new CompetitionGroupUpsertConflictError('two rows'),
    );

    await expect(
      call(harness.router.competitionGroups.upsert, {
        name: 'Chaos Cup',
        leagueId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'two rows',
    });
  });

  it('returns every group from list', async () => {
    harness.mocks.competitionGroupsService.listAll.mockResolvedValue([
      { id: 1, name: 'Major Season' },
    ]);

    const result = await call(harness.router.competitionGroups.list, {});

    expect(result).toEqual([{ id: 1, name: 'Major Season' }]);
  });
});

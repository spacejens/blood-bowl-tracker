import {
  LeagueUpsertConflictError,
  MissingRequiredFieldError,
} from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

/**
 * The route builders are private methods of RpcRouterFactoryService, so they
 * are exercised the only way they are ever used: through the router build()
 * returns. This suite pins the behaviour the builders are responsible for --
 * per-entity wiring is covered entity by entity in the sibling spec files.
 *
 * That per-entity coverage is not a convenience duplicate of this suite: the
 * generic builders erase the compile-time link between a procedure, its
 * game-data service, and its conflict-error class (each is just a
 * concretely-typed argument at a generic call site), so the sibling specs
 * (rpc-router-factory.service.spec.ts, rpc-router-factory-batch.service.spec.ts,
 * rpc-router-factory-competition-groups.service.spec.ts, and
 * rpc-router-factory-trophy-awards.service.spec.ts) are the only check that a
 * given entity's procedure/service/conflict-error triple is actually wired
 * correctly. Do not trim them as redundant once this suite exists.
 */
describe('route builders', () => {
  const league = {
    id: 1,
    name: 'Test League',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    historyVersion: 1,
    historyPeriod: '["2026-01-01 00:00:00+00",)',
  };
  const input = {
    name: 'Test League',
    externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
  };

  it('flattens the unwrapped entity and its created flag into the response', async () => {
    const { router, mocks } = await createRouterHarness();
    mocks.leaguesService.upsert.mockResolvedValue({ league, created: true });

    await expect(call(router.leagues.upsert, input)).resolves.toEqual({
      id: 1,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    expect(mocks.leaguesService.upsert).toHaveBeenCalledWith(input);
  });

  it('maps the configured conflict error to CONFLICT', async () => {
    const { router, mocks } = await createRouterHarness();
    mocks.leaguesService.upsert.mockRejectedValue(
      new LeagueUpsertConflictError('matched leagues 1, 2'),
    );

    await expect(call(router.leagues.upsert, input)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'matched leagues 1, 2',
    });
  });

  it('maps a missing required field to BAD_REQUEST', async () => {
    const { router, mocks } = await createRouterHarness();
    mocks.leaguesService.upsert.mockRejectedValue(
      new MissingRequiredFieldError('name is required'),
    );

    await expect(call(router.leagues.upsert, input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'name is required',
    });
  });

  it('rethrows an unexpected error untouched', async () => {
    const { router, mocks } = await createRouterHarness();
    mocks.leaguesService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(call(router.leagues.upsert, input)).rejects.toThrow(
      'db unavailable',
    );
  });

  it('answers a batch index-aligned with the request', async () => {
    const { router, mocks } = await createRouterHarness();
    mocks.leaguesService.upsert
      .mockResolvedValueOnce({ league, created: true })
      .mockResolvedValueOnce({
        league: { ...league, id: 2, name: 'Other League' },
        created: false,
      });

    await expect(
      call(router.leagues.upsertBatch, [
        input,
        {
          name: 'Other League',
          externalIds: [{ externalSystemId: 1, externalId: 'e2' }],
        },
      ]),
    ).resolves.toEqual([
      {
        id: 1,
        name: 'Test League',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
      {
        id: 2,
        name: 'Other League',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: false,
      },
    ]);
  });

  it('turns one item conflict into that item failing, not the batch', async () => {
    const { router, mocks } = await createRouterHarness();
    mocks.leaguesService.upsert
      .mockRejectedValueOnce(new LeagueUpsertConflictError('matched 1, 2'))
      .mockResolvedValueOnce({ league, created: true });

    await expect(
      call(router.leagues.upsertBatch, [
        {
          name: 'Bad League',
          externalIds: [{ externalSystemId: 1, externalId: 'e3' }],
        },
        input,
      ]),
    ).resolves.toEqual([
      { success: false, error: 'matched 1, 2' },
      {
        id: 1,
        name: 'Test League',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });
});

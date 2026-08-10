import { CoachUpsertConflictError } from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

type Harness = Awaited<ReturnType<typeof createRouterHarness>>;

describe('RpcRouterFactoryService batch upserts', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  const coachInput = (name: string) => ({
    name,
    externalIds: [{ externalSystemId: 1, externalId: `e-${name}` }],
  });

  const coachRow = (id: number, name: string) => ({
    id,
    name,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    historyVersion: 1,
    historyPeriod: '["2026-01-01 00:00:00+00",)',
  });

  it('coaches.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.coachesService.upsert
      .mockResolvedValueOnce({ coach: coachRow(1, 'Griff'), created: true })
      .mockResolvedValueOnce({ coach: coachRow(2, 'Morg'), created: false });

    const result = await call(harness.router.coaches.upsertBatch, [
      coachInput('Griff'),
      coachInput('Morg'),
    ]);

    expect(result).toEqual([
      {
        id: 1,
        name: 'Griff',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
      {
        id: 2,
        name: 'Morg',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: false,
      },
    ]);
    expect(harness.mocks.coachesService.upsert).toHaveBeenCalledTimes(2);
  });

  it('coaches.upsertBatch reports a conflicting item without failing its siblings', async () => {
    harness.mocks.coachesService.upsert
      .mockRejectedValueOnce(
        new CoachUpsertConflictError(
          'External IDs matched multiple existing coaches: 1, 2',
        ),
      )
      .mockResolvedValueOnce({ coach: coachRow(2, 'Morg'), created: true });

    const result = await call(harness.router.coaches.upsertBatch, [
      coachInput('Griff'),
      coachInput('Morg'),
    ]);

    expect(result).toEqual([
      {
        success: false,
        error: 'External IDs matched multiple existing coaches: 1, 2',
      },
      {
        id: 2,
        name: 'Morg',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('coaches.upsertBatch rethrows an error that is not a conflict', async () => {
    harness.mocks.coachesService.upsert.mockRejectedValue(
      new Error('db unavailable'),
    );

    await expect(
      call(harness.router.coaches.upsertBatch, [coachInput('Griff')]),
    ).rejects.toThrow('db unavailable');
  });

  it('externalSystems.upsertBatch returns flat success entries', async () => {
    harness.mocks.externalSystemsService.upsert.mockResolvedValue({
      system: {
        id: 1,
        name: 'BBL',
        category: 'imported_data_source',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: false,
    });

    const result = await call(harness.router.externalSystems.upsertBatch, [
      { name: 'BBL', category: 'imported_data_source' as const },
    ]);

    expect(result).toEqual([
      {
        id: 1,
        name: 'BBL',
        category: 'imported_data_source',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: false,
      },
    ]);
  });
});

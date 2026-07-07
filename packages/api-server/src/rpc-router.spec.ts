import { describe, it, expect, vi } from 'vitest';
import { call } from '@orpc/server';
import { buildRpcRouter } from './rpc-router';
import { CoachUpsertConflictError } from '@blood-bowl-tracker/game-data';
import type {
  CoachesService,
  ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';

function makeServices() {
  return {
    coachesService: { upsert: vi.fn() } as unknown as CoachesService,
    externalSystemsService: {
      upsert: vi.fn(),
    } as unknown as ExternalSystemsService,
  };
}

describe('buildRpcRouter', () => {
  it('coaches.upsert returns the flat entity with a created flag', async () => {
    const { coachesService, externalSystemsService } = makeServices();
    (coachesService.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      coach: { id: 1, name: 'Roze Madder', createdAt: new Date('2026-01-01') },
      created: true,
    });
    const router = buildRpcRouter(coachesService, externalSystemsService);

    const result = await call(router.coaches.upsert, {
      name: 'Roze Madder',
      externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'Roze Madder',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('coaches.upsert throws CONFLICT when the service reports a conflict', async () => {
    const { coachesService, externalSystemsService } = makeServices();
    (coachesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new CoachUpsertConflictError(
        'External IDs matched multiple existing coaches: 1, 2',
      ),
    );
    const router = buildRpcRouter(coachesService, externalSystemsService);

    await expect(
      call(router.coaches.upsert, {
        name: 'Roze Madder',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing coaches: 1, 2',
    });
  });

  it('coaches.upsert rethrows errors that are not a conflict', async () => {
    const { coachesService, externalSystemsService } = makeServices();
    (coachesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db unavailable'),
    );
    const router = buildRpcRouter(coachesService, externalSystemsService);

    await expect(
      call(router.coaches.upsert, {
        name: 'Roze Madder',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('externalSystems.upsert returns the flat entity with a created flag', async () => {
    const { coachesService, externalSystemsService } = makeServices();
    (
      externalSystemsService.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      system: { id: 1, name: 'BBL', createdAt: new Date('2026-01-01') },
      created: false,
    });
    const router = buildRpcRouter(coachesService, externalSystemsService);

    const result = await call(router.externalSystems.upsert, { name: 'BBL' });

    expect(result).toEqual({
      id: 1,
      name: 'BBL',
      createdAt: new Date('2026-01-01'),
      created: false,
    });
  });
});

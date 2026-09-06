import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NOT_CURRENT_HOLDER, ReviewLockService } from './review-lock.service';
import {
  createFakeState,
  FakeReviewLockStore,
  holderOf,
  queuedOf,
} from './review-lock.test-helpers';
import {
  EMPTY_REVIEW_LOCK_STATE,
  ReviewLockState,
  ReviewLockStateService,
} from './review-lock-state.service';

const NOW = '2026-09-06T03:10:00.000Z';

describe('ReviewLockService heartbeat/release', () => {
  let store: FakeReviewLockStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function makeService(
    initial: ReviewLockState = EMPTY_REVIEW_LOCK_STATE,
  ): Promise<ReviewLockService> {
    store = createFakeState(initial);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewLockService,
        { provide: ReviewLockStateService, useValue: store.state },
      ],
    }).compile();
    return moduleRef.get(ReviewLockService);
  }

  it('refreshes the heartbeat when this session holds the lock', async () => {
    const service = await makeService({
      holder: holderOf('branch-a', '2026-09-06T03:04:00.000Z'),
      queue: [queuedOf('branch-b')],
    });

    await expect(service.heartbeat('branch-a')).resolves.toEqual({ ok: true });
    expect(store.current().holder).toEqual({
      id: 'branch-a',
      acquiredAt: '2026-09-06T03:00:00.000Z',
      heartbeatAt: NOW,
    });
    expect(store.current().queue).toEqual([queuedOf('branch-b')]);
  });

  it('reports not-the-holder when another session holds the lock', async () => {
    const service = await makeService({
      holder: holderOf('branch-a', '2026-09-06T03:04:00.000Z'),
      queue: [],
    });

    await expect(service.heartbeat('branch-b')).resolves.toEqual({
      ok: false,
      reason: NOT_CURRENT_HOLDER,
    });
    expect(store.current().holder).toEqual(
      holderOf('branch-a', '2026-09-06T03:04:00.000Z'),
    );
  });

  it('reports not-the-holder when the lock is free', async () => {
    const service = await makeService({ holder: null, queue: [] });

    await expect(service.heartbeat('branch-a')).resolves.toEqual({
      ok: false,
      reason: NOT_CURRENT_HOLDER,
    });
    expect(store.current().holder).toBeNull();
  });

  it('clears the holder when the releasing session holds the lock', async () => {
    const service = await makeService({
      holder: holderOf('branch-a', NOW),
      queue: [queuedOf('branch-b')],
    });

    await expect(service.release('branch-a')).resolves.toEqual({
      released: true,
    });
    expect(store.current()).toEqual({
      holder: null,
      queue: [queuedOf('branch-b')],
    });
  });

  it('removes a queued-only ticket and leaves the holder untouched', async () => {
    const service = await makeService({
      holder: holderOf('branch-a', NOW),
      queue: [queuedOf('branch-b'), queuedOf('branch-c')],
    });

    await expect(service.release('branch-b')).resolves.toEqual({
      released: true,
    });
    expect(store.current()).toEqual({
      holder: holderOf('branch-a', NOW),
      queue: [queuedOf('branch-c')],
    });
  });

  it('reports released:false when the id is neither holding nor queued', async () => {
    const service = await makeService({
      holder: holderOf('branch-a', NOW),
      queue: [queuedOf('branch-b')],
    });

    await expect(service.release('branch-z')).resolves.toEqual({
      released: false,
    });
    expect(store.current()).toEqual({
      holder: holderOf('branch-a', NOW),
      queue: [queuedOf('branch-b')],
    });
  });
});

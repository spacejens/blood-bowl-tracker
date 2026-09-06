import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReviewLockService } from './review-lock.service';
import {
  createFakeState,
  FakeReviewLockStore,
  holderOf,
  queuedOf,
} from './review-lock.test-helpers';
import {
  ReviewLockState,
  ReviewLockStateService,
} from './review-lock-state.service';

const NOW = '2026-09-06T03:10:00.000Z';
/** Older than the 15-minute staleness threshold, relative to NOW. */
const STALE_HEARTBEAT = '2026-09-06T02:50:00.000Z';
/** Well inside the staleness threshold, relative to NOW. */
const FRESH_HEARTBEAT = '2026-09-06T03:08:00.000Z';

describe('ReviewLockService acquire', () => {
  let store: FakeReviewLockStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function makeService(
    initial: ReviewLockState,
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

  /**
   * Drives an acquire that must poll: the returned promise only settles once
   * enough timer time has been advanced, so the advancing has to happen while
   * the acquire is still pending rather than after an `await`.
   */
  async function runAcquire(
    service: ReviewLockService,
    options: Parameters<ReviewLockService['acquire']>[0],
    advanceMs = 10 * 60 * 1000,
  ): Promise<Awaited<ReturnType<ReviewLockService['acquire']>>> {
    const pending = service.acquire(options);
    await vi.advanceTimersByTimeAsync(advanceMs);
    return pending;
  }

  it('acquires immediately when the lock is free and nobody is queued', async () => {
    const service = await makeService({ holder: null, queue: [] });

    const result = await service.acquire({ holderId: 'branch-a' });

    expect(result).toEqual({ acquired: true, waitedMs: 0 });
    expect(store.current()).toEqual({
      holder: { id: 'branch-a', acquiredAt: NOW, heartbeatAt: NOW },
      queue: [],
    });
  });

  it('enqueues and waits while another session holds a fresh lock', async () => {
    const service = await makeService({
      holder: holderOf('branch-b', FRESH_HEARTBEAT),
      queue: [],
    });

    const result = await runAcquire(
      service,
      { holderId: 'branch-a', timeoutMs: 60_000, intervalMs: 30_000 },
      120_000,
    );

    expect(result).toEqual({ acquired: false, timedOut: true });
    expect(store.current().holder).toEqual(
      holderOf('branch-b', FRESH_HEARTBEAT),
    );
    expect(store.current().queue).toEqual([
      { id: 'branch-a', enqueuedAt: NOW },
    ]);
  });

  it('acquires on a later poll once the holder releases', async () => {
    const service = await makeService({
      holder: holderOf('branch-b', FRESH_HEARTBEAT),
      queue: [],
    });

    const pending = service.acquire({
      holderId: 'branch-a',
      intervalMs: 30_000,
    });
    // One failed attempt has run and enqueued branch-a; free the lock as if
    // branch-b had just released it, then let the next poll fire.
    await vi.advanceTimersByTimeAsync(1);
    await store.state.mutate((state) => ({
      state: { holder: null, queue: state.queue },
      result: null,
    }));
    await vi.advanceTimersByTimeAsync(30_000);

    // The exact waitedMs, acquiredAt, and heartbeatAt all depend on where
    // inside the advanced window the poll's own microtasks land (fake-timer
    // time keeps advancing while the poll runs), so assert their shape, not
    // fixed values.
    await expect(pending).resolves.toEqual({
      acquired: true,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real number
      waitedMs: expect.any(Number),
    });
    expect(store.current()).toEqual({
      holder: {
        id: 'branch-a',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real string
        acquiredAt: expect.any(String),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real string
        heartbeatAt: expect.any(String),
      },
      queue: [],
    });
  });

  it('waits behind an earlier queue entry rather than jumping the queue', async () => {
    const service = await makeService({
      holder: null,
      queue: [queuedOf('branch-b')],
    });

    const result = await runAcquire(
      service,
      { holderId: 'branch-a', timeoutMs: 60_000, intervalMs: 30_000 },
      120_000,
    );

    expect(result).toEqual({ acquired: false, timedOut: true });
    expect(store.current().holder).toBeNull();
    expect(store.current().queue.map((entry) => entry.id)).toEqual([
      'branch-b',
      'branch-a',
    ]);
  });

  it('reclaims a lock whose holder stopped heartbeating', async () => {
    const service = await makeService({
      holder: holderOf('branch-b', STALE_HEARTBEAT),
      queue: [],
    });

    const result = await service.acquire({ holderId: 'branch-a' });

    expect(result).toEqual({ acquired: true, waitedMs: 0 });
    expect(store.current().holder).toEqual({
      id: 'branch-a',
      acquiredAt: NOW,
      heartbeatAt: NOW,
    });
  });

  it('is a heartbeat-refreshing no-op when this session already holds the lock', async () => {
    const service = await makeService({
      holder: holderOf('branch-a', '2026-09-06T03:05:00.000Z'),
      queue: [queuedOf('branch-b')],
    });

    const result = await service.acquire({ holderId: 'branch-a' });

    expect(result).toEqual({ acquired: true, waitedMs: 0 });
    expect(store.current()).toEqual({
      holder: {
        id: 'branch-a',
        acquiredAt: '2026-09-06T03:00:00.000Z',
        heartbeatAt: NOW,
      },
      queue: [queuedOf('branch-b')],
    });
  });

  it('does not add a second ticket for an id already in the queue', async () => {
    const service = await makeService({
      holder: holderOf('branch-b', FRESH_HEARTBEAT),
      queue: [queuedOf('branch-a', '2026-09-06T03:02:00.000Z')],
    });

    await runAcquire(
      service,
      { holderId: 'branch-a', timeoutMs: 60_000, intervalMs: 30_000 },
      120_000,
    );

    expect(store.current().queue).toEqual([
      queuedOf('branch-a', '2026-09-06T03:02:00.000Z'),
    ]);
  });

  it('polls at the requested interval', async () => {
    const service = await makeService({
      holder: holderOf('branch-b', FRESH_HEARTBEAT),
      queue: [],
    });

    await runAcquire(
      service,
      { holderId: 'branch-a', timeoutMs: 90_000, intervalMs: 30_000 },
      150_000,
    );

    // Attempts at t=0, t=30s and t=60s. The sleep after the third lands
    // exactly on the 90s deadline, so the post-sleep re-check returns
    // instead of running a fourth attempt.
    expect(store.state.mutate).toHaveBeenCalledTimes(3);
  });
});

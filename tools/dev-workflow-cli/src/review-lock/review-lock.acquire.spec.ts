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
/**
 * Older than the 100-minute staleness threshold, relative to NOW. Used for
 * both a holder's `heartbeatAt` and a queue entry's `enqueuedAt` — the same
 * threshold governs both.
 */
const STALE_HEARTBEAT = '2026-09-06T01:25:00.000Z';
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
    // The ticket's own enqueuedAt is refreshed on each poll (proof of life),
    // so after more than one attempt it no longer equals the original NOW.
    const queue = store.current().queue;
    expect(queue.map((entry) => entry.id)).toEqual(['branch-a']);
    expect(
      new Date(queue[0]?.enqueuedAt ?? '').getTime(),
    ).toBeGreaterThanOrEqual(new Date(NOW).getTime());
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

    // Only one entry for branch-a — its own ticket is refreshed in place
    // (proof of life) rather than duplicated, so its enqueuedAt now reflects
    // the latest poll rather than the original timestamp.
    const queue = store.current().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe('branch-a');
  });

  it('drops a stale queue entry ahead of the caller, letting it acquire', async () => {
    const service = await makeService({
      holder: null,
      queue: [queuedOf('branch-stale', STALE_HEARTBEAT)],
    });

    const result = await service.acquire({ holderId: 'branch-a' });

    expect(result).toEqual({ acquired: true, waitedMs: 0 });
    expect(store.current()).toEqual({
      holder: { id: 'branch-a', acquiredAt: NOW, heartbeatAt: NOW },
      queue: [],
    });
  });

  it("keeps a caller's own ticket in place while refreshing it across multiple polls", async () => {
    const service = await makeService({
      holder: holderOf('branch-b', FRESH_HEARTBEAT),
      queue: [queuedOf('branch-front')],
    });

    await runAcquire(
      service,
      { holderId: 'branch-a', timeoutMs: 90_000, intervalMs: 30_000 },
      150_000,
    );

    // FIFO order among live entries is untouched: branch-front (enqueued
    // first) still precedes branch-a even though branch-a's own ticket was
    // refreshed on every one of the three polls.
    const queue = store.current().queue;
    expect(queue.map((entry) => entry.id)).toEqual([
      'branch-front',
      'branch-a',
    ]);
    expect(queue[0]).toEqual(queuedOf('branch-front'));
    expect(new Date(queue[1]?.enqueuedAt ?? '').getTime()).toBeGreaterThan(
      new Date(NOW).getTime(),
    );
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

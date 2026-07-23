import { describe, expect, it, vi } from 'vitest';

import { DatabaseTimeoutService } from './database-timeout.service';

describe('DatabaseTimeoutService', () => {
  it('resolves with the work result when it settles in time', async () => {
    const service = new DatabaseTimeoutService();
    await expect(service.run(Promise.resolve(42), -1)).resolves.toBe(42);
  });

  it('falls back when work does not settle before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const service = new DatabaseTimeoutService();
      const promise = service.run<number>(new Promise(() => {}), -1, 2000);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe(-1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates a rejection that beats the timeout', async () => {
    const service = new DatabaseTimeoutService();
    await expect(
      service.run(Promise.reject(new Error('boom')), 0),
    ).rejects.toThrow('boom');
  });
});

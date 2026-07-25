import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DatabaseTimeoutService } from './database-timeout.service';

describe('DatabaseTimeoutService', () => {
  let service: DatabaseTimeoutService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DatabaseTimeoutService],
    }).compile();
    service = moduleRef.get(DatabaseTimeoutService);
  });

  it('resolves with the work result when it settles in time', async () => {
    await expect(service.run(Promise.resolve(42), -1)).resolves.toBe(42);
  });

  it('falls back when work does not settle before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const promise = service.run<number>(new Promise(() => {}), -1, 2000);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe(-1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates a rejection that beats the timeout', async () => {
    await expect(
      service.run(Promise.reject(new Error('boom')), 0),
    ).rejects.toThrow('boom');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  withDatabaseTimeout,
  DATABASE_TIMEOUT_FALLBACK_MESSAGE,
  DATABASE_TIMEOUT_MS,
} from './database-timeout';

describe('withDatabaseTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the work result when it settles in time', async () => {
    const result = await withDatabaseTimeout(
      Promise.resolve('done'),
      'fallback',
    );
    expect(result).toBe('done');
  });

  it('resolves with the fallback when work exceeds the timeout', async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const promise = withDatabaseTimeout(never, 'fallback', 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toBe('fallback');
  });

  it('propagates a work rejection that loses no race to the timeout', async () => {
    await expect(
      withDatabaseTimeout(Promise.reject(new Error('db down')), 'fallback'),
    ).rejects.toThrow('db down');
  });

  it('exposes "I am stunned" as the default fallback within the Discord window', () => {
    expect(DATABASE_TIMEOUT_FALLBACK_MESSAGE).toBe('I am stunned');
    expect(DATABASE_TIMEOUT_MS).toBeLessThan(3000);
  });
});

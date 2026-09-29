import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TpBlockedError } from './tp-blocked.error';
import { TpGateService } from './tp-gate.service';

const MINUTE = 60_000;
const T0 = Date.parse('2026-09-29T12:00:00.000Z');

describe('TpGateService', () => {
  let gate: TpGateService;
  let request: Mock<() => Promise<string>>;

  /** A request TP answers with a 403: it records the block and throws it. */
  const blockingRequest = (): Promise<never> => Promise.reject(gate.block());

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpGateService],
    }).compile();
    gate = moduleRef.get(TpGateService);
    request = vi.fn<() => Promise<string>>().mockResolvedValue('ok');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('pacing', () => {
    it('runs the first request of the process at once and returns its result', async () => {
      const turn = gate.run(request);
      await vi.advanceTimersByTimeAsync(0);

      expect(request).toHaveBeenCalledTimes(1);
      await expect(turn).resolves.toBe('ok');
    });

    it('waits 0.5 s after the previous request at the shortest', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      await gate.run(request);

      const second = gate.run(request);
      await vi.advanceTimersByTimeAsync(499);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('waits 2 s after the previous request at the longest', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      await gate.run(request);

      const second = gate.run(request);
      await vi.advanceTimersByTimeAsync(1999);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('counts time already spent since the previous request toward the wait', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // 1250 ms
      await gate.run(request);
      await vi.advanceTimersByTimeAsync(1000);

      const second = gate.run(request);
      await vi.advanceTimersByTimeAsync(249);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('does not wait at all once enough time has already passed', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      await gate.run(request);
      await vi.advanceTimersByTimeAsync(3000);

      const second = gate.run(request);
      await vi.advanceTimersByTimeAsync(0);
      expect(request).toHaveBeenCalledTimes(2);
      await second;
    });

    it('paces from when the previous request finished, not from when it started', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // 0.5 s
      const slow = () =>
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('slow'), 2500),
        );

      const first = gate.run(slow);
      await vi.advanceTimersByTimeAsync(2500);
      await first;

      const second = gate.run(request);
      await vi.advanceTimersByTimeAsync(0);
      expect(request).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500);
      await second;
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('queues concurrent requests in order, each paced against the one before', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // 0.5 s
      const order: string[] = [];
      const step = (name: string) => () => {
        order.push(name);
        return Promise.resolve(name);
      };

      const turns = Promise.all([
        gate.run(step('one')),
        gate.run(step('two')),
        gate.run(step('three')),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      expect(order).toEqual(['one']);
      await vi.advanceTimersByTimeAsync(500);
      expect(order).toEqual(['one', 'two']);
      await vi.advanceTimersByTimeAsync(500);
      expect(order).toEqual(['one', 'two', 'three']);
      await expect(turns).resolves.toEqual(['one', 'two', 'three']);
    });

    it('keeps the queue going after a request fails', async () => {
      const failing = gate.run(() => Promise.reject(new Error('boom')));
      const failed = expect(failing).rejects.toThrow('boom');
      const next = gate.run(request);

      await vi.advanceTimersByTimeAsync(2000);
      await failed;
      await expect(next).resolves.toBe('ok');
    });
  });

  describe('back-off', () => {
    it('backs off 5 minutes on a first block', async () => {
      const turn = gate.run(blockingRequest);

      await expect(turn).rejects.toBeInstanceOf(TpBlockedError);
      await expect(turn).rejects.toMatchObject({
        retryAt: new Date(T0 + 5 * MINUTE),
      });
    });

    it('fails every request during the back-off at once, without running it', async () => {
      await gate.run(blockingRequest).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(5 * MINUTE - 1);

      const turn = gate.run(request);
      await expect(turn).rejects.toBeInstanceOf(TpBlockedError);
      await expect(turn).rejects.toMatchObject({
        retryAt: new Date(T0 + 5 * MINUTE),
      });
      expect(request).not.toHaveBeenCalled();
    });

    it('marks a refusal during the back-off as not answered by TP', async () => {
      await gate.run(blockingRequest).catch(() => undefined);

      await expect(gate.run(request)).rejects.toMatchObject({
        answeredByTp: false,
      });
    });

    it('marks the block TP answered as answered by TP', () => {
      expect(gate.block().answeredByTp).toBe(true);
    });

    it('lets requests through again once the back-off has passed', async () => {
      await gate.run(blockingRequest).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(5 * MINUTE);

      await expect(gate.run(request)).resolves.toBe('ok');
    });

    it('grows the back-off on repeated blocks: 5 min, 15 min, 1 h, then 1 h again', async () => {
      await expect(gate.run(blockingRequest)).rejects.toMatchObject({
        retryAt: new Date(T0 + 5 * MINUTE),
      });
      await vi.advanceTimersByTimeAsync(5 * MINUTE);
      await expect(gate.run(blockingRequest)).rejects.toMatchObject({
        retryAt: new Date(T0 + 20 * MINUTE),
      });
      await vi.advanceTimersByTimeAsync(15 * MINUTE);
      await expect(gate.run(blockingRequest)).rejects.toMatchObject({
        retryAt: new Date(T0 + 80 * MINUTE),
      });
      await vi.advanceTimersByTimeAsync(60 * MINUTE);
      await expect(gate.run(blockingRequest)).rejects.toMatchObject({
        retryAt: new Date(T0 + 140 * MINUTE),
      });
    });

    it('starts from 5 minutes again after a successful request', async () => {
      await gate.run(blockingRequest).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(5 * MINUTE);
      await gate.run(() => {
        gate.succeeded();
        return Promise.resolve('ok');
      });
      await vi.advanceTimersByTimeAsync(2000);

      await expect(gate.run(blockingRequest)).rejects.toMatchObject({
        retryAt: new Date(T0 + 10 * MINUTE + 2000),
      });
    });
  });
});

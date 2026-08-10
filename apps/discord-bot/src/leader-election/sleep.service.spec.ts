import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SleepService } from './sleep.service';

describe('SleepService', () => {
  let service: SleepService;

  beforeEach(async () => {
    vi.useFakeTimers();
    const moduleRef = await Test.createTestingModule({
      providers: [SleepService],
    }).compile();
    service = moduleRef.get(SleepService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves only after the requested delay', async () => {
    const resolved = vi.fn();
    void service.sleep(1000).then(resolved);

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toHaveBeenCalledTimes(1);
  });
});

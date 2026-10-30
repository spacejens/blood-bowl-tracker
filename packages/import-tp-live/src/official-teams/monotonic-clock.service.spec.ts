import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MonotonicClockService } from './monotonic-clock.service';

describe('MonotonicClockService', () => {
  let service: MonotonicClockService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MonotonicClockService],
    }).compile();
    service = moduleRef.get(MonotonicClockService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the process's monotonic clock in milliseconds", () => {
    vi.spyOn(performance, 'now').mockReturnValue(1234.5);

    expect(service.nowMs()).toBe(1234.5);
  });
});

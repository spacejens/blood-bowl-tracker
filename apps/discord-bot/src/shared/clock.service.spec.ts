import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClockService } from './clock.service';

describe('ClockService', () => {
  let service: ClockService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ClockService],
    }).compile();
    service = moduleRef.get(ClockService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current time as a Date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-02-29T12:00:00Z'));

    const result = service.now();

    expect(result.toISOString()).toBe('2024-02-29T12:00:00.000Z');
  });
});

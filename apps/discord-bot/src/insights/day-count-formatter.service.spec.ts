import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DayCountFormatterService } from './day-count-formatter.service';

describe('DayCountFormatterService', () => {
  let service: DayCountFormatterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DayCountFormatterService],
    }).compile();
    service = moduleRef.get(DayCountFormatterService);
  });

  it('uses the singular form for exactly one day', () => {
    expect(service.format(1)).toBe('1 day');
  });

  it('uses the plural form for zero days', () => {
    expect(service.format(0)).toBe('0 days');
  });

  it('uses the plural form for more than one day', () => {
    expect(service.format(2)).toBe('2 days');
  });

  it('adds a thousands separator to large day counts', () => {
    expect(service.format(1234)).toBe('1,234 days');
  });
});

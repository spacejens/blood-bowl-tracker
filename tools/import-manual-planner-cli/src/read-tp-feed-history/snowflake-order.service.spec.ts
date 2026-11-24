import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SnowflakeOrderService } from './snowflake-order.service';

describe('SnowflakeOrderService', () => {
  let service: SnowflakeOrderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SnowflakeOrderService],
    }).compile();
    service = moduleRef.get(SnowflakeOrderService);
  });

  it('compares ids beyond the safe integer range exactly', () => {
    expect(
      service.compare('1400000000000000001', '1400000000000000002'),
    ).toBeLessThan(0);
    expect(
      service.compare('1400000000000000002', '1400000000000000001'),
    ).toBeGreaterThan(0);
    expect(service.compare('1400000000000000001', '1400000000000000001')).toBe(
      0,
    );
  });

  it('compares numerically, not as text', () => {
    expect(service.compare('9', '10')).toBeLessThan(0);
  });

  it('finds the newest and the oldest id', () => {
    const ids = ['1400000000000000005', '999', '1400000000000000010'];

    expect(service.newest(ids)).toBe('1400000000000000010');
    expect(service.oldest(ids)).toBe('999');
  });
});

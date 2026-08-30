import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { ClockService } from './clock.service';
import { MonthDayService } from './month-day.service';

describe('MonthDayService', () => {
  let service: MonthDayService;
  let clock: ReturnType<typeof mockDeep<ClockService>>;

  beforeEach(async () => {
    clock = mockDeep<ClockService>();
    const moduleRef = await Test.createTestingModule({
      providers: [MonthDayService, { provide: ClockService, useValue: clock }],
    }).compile();
    service = moduleRef.get(MonthDayService);
  });

  describe('parse', () => {
    it('parses a valid MM-DD string', () => {
      const result = service.parse('06-01');

      expect(result).toEqual({ month: 6, day: 1 });
    });

    it('accepts February 29 as a valid calendar date', () => {
      const result = service.parse('02-29');

      expect(result).toEqual({ month: 2, day: 29 });
    });

    it.each([
      '02-30', // invalid day for February
      '04-31', // April has 30 days
      '13-01', // month 13 does not exist
      '00-10', // month 0 does not exist
      '01-00', // day 0 does not exist
      '1-1', // wrong format (single digits)
      '2024-06-01', // wrong format (YYYY-MM-DD)
      'june-01', // wrong format (text month)
      '', // empty string
    ])('rejects invalid input "%s"', (input: string) => {
      const result = service.parse(input);

      expect(result).toBeNull();
    });
  });

  describe('today', () => {
    it('reads today from the clock using UTC accessors, not local ones', () => {
      // CI (GitHub Actions ubuntu-latest) already runs with TZ=UTC, and this
      // repo's Vitest config does not pin any other timezone. That means a
      // Date.UTC-based fixture makes getMonth()/getDate() (the pre-fix,
      // local-time bug) return the exact same values as
      // getUTCMonth()/getUTCDate() (the fix) on the machine this test
      // actually runs on. Asserting only the returned value would therefore
      // pass identically whether or not the bug were still present. Spying
      // on which Date accessor is actually invoked is what makes this test
      // discriminate the UTC-safe implementation from the local-time bug,
      // regardless of the ambient timezone of whatever machine runs it.
      const now = new Date(Date.UTC(2024, 1, 29, 23, 30));
      clock.now.mockReturnValue(now);
      const getMonth = vi.spyOn(now, 'getMonth');
      const getDate = vi.spyOn(now, 'getDate');
      const getUTCMonth = vi.spyOn(now, 'getUTCMonth');
      const getUTCDate = vi.spyOn(now, 'getUTCDate');

      const result = service.today();

      expect(getMonth).not.toHaveBeenCalled();
      expect(getDate).not.toHaveBeenCalled();
      expect(getUTCMonth).toHaveBeenCalled();
      expect(getUTCMonth).toHaveReturnedWith(1);
      expect(getUTCDate).toHaveBeenCalled();
      expect(getUTCDate).toHaveReturnedWith(29);
      expect(result).toEqual({ month: 2, day: 29 });
    });
  });

  describe('format', () => {
    it('formats a month-day pair as English text', () => {
      const result = service.format({ month: 2, day: 29 });

      expect(result).toBe('February 29');
    });

    it('formats another month-day pair', () => {
      const result = service.format({ month: 12, day: 3 });

      expect(result).toBe('December 3');
    });
  });
});

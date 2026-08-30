import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
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
    it('reads today from the clock in UTC', () => {
      // A local time that would be March 1 in a timezone ahead of UTC,
      // constructed via Date.UTC so the assertion actually exercises the
      // UTC getters rather than happening to match local getters too.
      clock.now.mockReturnValue(new Date(Date.UTC(2024, 1, 29, 23, 30)));

      const result = service.today();

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

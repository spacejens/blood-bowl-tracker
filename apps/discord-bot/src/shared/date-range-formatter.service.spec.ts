import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { DateRangeFormatterService } from './date-range-formatter.service';

describe('DateRangeFormatterService', () => {
  let service: DateRangeFormatterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DateRangeFormatterService],
    }).compile();
    service = moduleRef.get(DateRangeFormatterService);
  });

  describe('format', () => {
    it('renders a multi-day range as "start – end"', () => {
      expect(service.format('2021-09-01', '2023-06-10')).toBe(
        '2021-09-01 – 2023-06-10',
      );
    });

    it('renders an ongoing range (null end date) as "start – present"', () => {
      expect(service.format('2021-09-01', null)).toBe('2021-09-01 – present');
    });

    it('renders a single-day range as just the start date, with no dash', () => {
      expect(service.format('2024-03-16', '2024-03-16')).toBe('2024-03-16');
    });

    it('does not collapse two different dates that merely share a prefix', () => {
      expect(service.format('2024-03-16', '2024-03-17')).toBe(
        '2024-03-16 – 2024-03-17',
      );
    });
  });
});

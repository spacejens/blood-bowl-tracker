import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { MatchDateRangeService } from './match-date-range.service';

describe('MatchDateRangeService', () => {
  let service: MatchDateRangeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MatchDateRangeService],
    }).compile();
    service = moduleRef.get(MatchDateRangeService);
  });

  it('returns the single date as both ends with a zero span', () => {
    const only = new Date(Date.UTC(2021, 8, 25));
    expect(service.computeRange([only])).toEqual({
      earliestDate: only,
      latestDate: only,
      spanDays: 0,
    });
  });

  it('returns the min and max of an unordered list with the day span between them', () => {
    const range = service.computeRange([
      new Date(Date.UTC(2011, 11, 18)),
      new Date(Date.UTC(2011, 11, 7)),
      new Date(Date.UTC(2011, 11, 11)),
    ]);
    expect(range.earliestDate).toEqual(new Date(Date.UTC(2011, 11, 7)));
    expect(range.latestDate).toEqual(new Date(Date.UTC(2011, 11, 18)));
    expect(range.spanDays).toBe(11);
  });

  it('reports a fractional span for dates that are not whole days apart', () => {
    const range = service.computeRange([
      new Date(Date.UTC(2021, 8, 25, 0, 0, 0)),
      new Date(Date.UTC(2021, 8, 26, 12, 0, 0)),
    ]);
    expect(range.spanDays).toBe(1.5);
  });

  it('throws when given no dates at all', () => {
    expect(() => service.computeRange([])).toThrow(
      'computeRange requires at least one date',
    );
  });
});

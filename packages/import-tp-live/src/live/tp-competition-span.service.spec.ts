import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpCompetitionSpanService } from './tp-competition-span.service';

describe('TpCompetitionSpanService', () => {
  let service: TpCompetitionSpanService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpCompetitionSpanService],
    }).compile();
    service = moduleRef.get(TpCompetitionSpanService);
  });

  it('classifies a span of at most three days as a cup', () => {
    expect(
      service.derive([
        new Date('2026-03-08T10:00:00Z'),
        new Date('2026-03-06T10:00:00Z'),
        new Date('2026-03-09T10:00:00Z'),
      ]),
    ).toEqual({ type: 'cup', startDate: '2026-03-06', endDate: '2026-03-09' });
  });

  it('classifies a longer span as a season', () => {
    expect(
      service.derive([
        new Date('2026-01-10T12:00:00Z'),
        new Date('2026-01-13T12:00:01Z'),
      ]),
    ).toEqual({
      type: 'season',
      startDate: '2026-01-10',
      endDate: '2026-01-13',
    });
  });

  it('derives nothing from no dates', () => {
    expect(service.derive([])).toBeUndefined();
  });
});

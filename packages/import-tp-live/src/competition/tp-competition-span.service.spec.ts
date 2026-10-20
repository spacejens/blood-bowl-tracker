import { CompetitionTypeService } from '@blood-bowl-tracker/import-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpCompetitionSpanService } from './tp-competition-span.service';

describe('TpCompetitionSpanService', () => {
  let service: TpCompetitionSpanService;
  let competitionType: MockProxy<CompetitionTypeService>;

  beforeEach(async () => {
    competitionType = mock<CompetitionTypeService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCompetitionSpanService,
        { provide: CompetitionTypeService, useValue: competitionType },
      ],
    }).compile();
    service = moduleRef.get(TpCompetitionSpanService);
  });

  it('classifies by the match-date span in days and derives the dates', () => {
    competitionType.fromSpanDays.mockReturnValue('cup');

    expect(
      service.derive([
        new Date('2026-03-08T10:00:00Z'),
        new Date('2026-03-06T10:00:00Z'),
        new Date('2026-03-09T10:00:00Z'),
      ]),
    ).toEqual({ type: 'cup', startDate: '2026-03-06', endDate: '2026-03-09' });
    expect(competitionType.fromSpanDays).toHaveBeenCalledWith(3);
  });

  it('passes a fractional span through and returns the type it is given', () => {
    competitionType.fromSpanDays.mockReturnValue('season');

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
    expect(competitionType.fromSpanDays.mock.calls[0][0]).toBeCloseTo(
      3 + 1 / 86400,
      9,
    );
  });

  it('derives nothing from no dates', () => {
    expect(service.derive([])).toBeUndefined();
    expect(competitionType.fromSpanDays).not.toHaveBeenCalled();
  });
});

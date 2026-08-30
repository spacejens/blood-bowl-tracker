import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DateButtonIdService } from './date-button-id.service';
import { MonthDayService } from './month-day.service';

describe('DateButtonIdService', () => {
  let service: DateButtonIdService;
  let monthDay: MockProxy<MonthDayService>;

  const LEAP_DAY = { month: 2, day: 29 };

  beforeEach(async () => {
    monthDay = mock<MonthDayService>();
    monthDay.parse.mockReturnValue(LEAP_DAY);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DateButtonIdService,
        { provide: MonthDayService, useValue: monthDay },
      ],
    }).compile();
    service = moduleRef.get(DateButtonIdService);
  });

  it('encodes an unscoped date as a zero-padded MM-DD', () => {
    expect(service.encode(LEAP_DAY, {})).toBe('02-29');
    expect(service.encode({ month: 12, day: 3 }, {})).toBe('12-03');
  });

  it('encodes a league scope', () => {
    expect(service.encode(LEAP_DAY, { leagueId: 5 })).toBe('02-29:league:5');
  });

  it('encodes an era scope', () => {
    expect(service.encode(LEAP_DAY, { eraId: 12 })).toBe('02-29:era:12');
  });

  it('encodes a competition scope', () => {
    expect(service.encode(LEAP_DAY, { competitionId: 7 })).toBe(
      '02-29:competition:7',
    );
  });

  it('encodes a match-category scope', () => {
    expect(service.encode(LEAP_DAY, { category: 'normal' })).toBe(
      '02-29:matchCategory:normal',
    );
  });

  it('decodes an unscoped id, delegating the date to MonthDayService', () => {
    expect(service.decode('02-29')).toEqual({
      monthDay: LEAP_DAY,
      scopeToken: null,
    });
    expect(monthDay.parse).toHaveBeenCalledWith('02-29');
  });

  it('round-trips a league scope', () => {
    expect(service.decode(service.encode(LEAP_DAY, { leagueId: 5 }))).toEqual({
      monthDay: LEAP_DAY,
      scopeToken: { kind: 'league', id: 5 },
    });
  });

  it('round-trips an era scope', () => {
    expect(service.decode(service.encode(LEAP_DAY, { eraId: 12 }))).toEqual({
      monthDay: LEAP_DAY,
      scopeToken: { kind: 'era', id: 12 },
    });
  });

  it('round-trips a competition scope', () => {
    expect(
      service.decode(service.encode(LEAP_DAY, { competitionId: 7 })),
    ).toEqual({
      monthDay: LEAP_DAY,
      scopeToken: { kind: 'competition', id: 7 },
    });
  });

  it('round-trips a match-category scope', () => {
    expect(
      service.decode(service.encode(LEAP_DAY, { category: 'season_final' })),
    ).toEqual({
      monthDay: LEAP_DAY,
      scopeToken: { kind: 'matchCategory', value: 'season_final' },
    });
  });

  it('encodes only the first scope field when several are somehow set', () => {
    expect(service.encode(LEAP_DAY, { leagueId: 5, eraId: 12 })).toBe(
      '02-29:league:5',
    );
  });

  it('returns null when the date part is not a real calendar date', () => {
    monthDay.parse.mockReturnValue(null);
    expect(service.decode('02-30')).toBeNull();
  });

  it('returns null for an unknown scope kind', () => {
    expect(service.decode('02-29:coach:5')).toBeNull();
  });

  it('returns null for a non-numeric entity id', () => {
    expect(service.decode('02-29:league:abc')).toBeNull();
  });

  it('returns null for entity ids that Number() would coerce but encode never produces', () => {
    expect(service.decode('02-29:league:')).toBeNull();
    expect(service.decode('02-29:league:-5')).toBeNull();
    expect(service.decode('02-29:league: 5')).toBeNull();
    expect(service.decode('02-29:league:5.0')).toBeNull();
    expect(service.decode('02-29:league:0x5')).toBeNull();
  });

  it('returns null for a match category that is not a real one', () => {
    expect(service.decode('02-29:matchCategory:brawl')).toBeNull();
  });

  it('returns null when the id has the wrong number of segments', () => {
    expect(service.decode('02-29:league')).toBeNull();
    expect(service.decode('02-29:league:5:extra')).toBeNull();
  });
});

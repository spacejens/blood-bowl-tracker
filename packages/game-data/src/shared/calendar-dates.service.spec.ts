import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CalendarDatesService } from './calendar-dates.service';
import { firstCallArg, sqlText } from './query-assertions.test-helpers';

describe('CalendarDatesService', () => {
  let service: CalendarDatesService;
  let db: Db;
  let chains: QueryChain[];

  beforeEach(async () => {
    ({ db, chains } = mockDb());
    const moduleRef = await Test.createTestingModule({
      providers: [CalendarDatesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(CalendarDatesService);
  });

  it('selects the month and day of every generated date', () => {
    service.allDates();
    const fields = firstCallArg(db.select) as { month: unknown; day: unknown };
    expect(sqlText(fields.month)).toContain('extract(month from d)::int');
    expect(sqlText(fields.day)).toContain('extract(day from d)::int');
  });

  it('generates every date of a leap year, so February 29 is included', () => {
    service.allDates();
    const from = sqlText(firstCallArg(chains[0].from));
    expect(from).toContain('generate_series');
    expect(from).toContain("date '2000-01-01'");
    expect(from).toContain("date '2000-12-31'");
    expect(from).toContain("interval '1 day'");
  });

  it('aliases the subquery so callers can join against it', () => {
    service.allDates();
    expect(firstCallArg(chains[0].as)).toBe('calendar_dates');
  });
});

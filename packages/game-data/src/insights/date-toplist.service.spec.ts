import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { CalendarDates } from '../shared/calendar-dates.service';
import { CalendarDatesService } from '../shared/calendar-dates.service';
import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { MatchScopeFilterService } from '../shared/match-scope-filter.service';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { DateToplistService } from './date-toplist.service';

describe('DateToplistService', () => {
  // A scope narrow enough that most of the calendar has no matches at all, so
  // these rows check that zero-count dates — Feb 29 among them — are still
  // included in the result.
  const rows = [
    { month: 1, day: 1, count: 0 },
    { month: 2, day: 29, count: 0 },
    { month: 6, day: 1, count: 9 },
  ];

  // Stands in for the subquery CalendarDatesService returns; real `sql`
  // fragments so `sqlText` can prove the outer query references them.
  const calendar = {
    month: sql`"calendar_dates"."month"`,
    day: sql`"calendar_dates"."day"`,
  } as unknown as CalendarDates;

  async function build(): Promise<{
    service: DateToplistService;
    db: Db;
    chains: QueryChain[];
    calendarDates: MockProxy<CalendarDatesService>;
  }> {
    // chains[0] is the date_counts subquery; chains[1] is the outer ranking
    // query, and only it resolves to rows.
    const { db, chains } = mockDb([], rows);
    const calendarDates = mock<CalendarDatesService>();
    calendarDates.allDates.mockReturnValue(calendar);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DateToplistService,
        MatchScopeFilterService,
        { provide: CalendarDatesService, useValue: calendarDates },
        { provide: DB, useValue: db },
      ],
    }).compile();
    return {
      service: moduleRef.get(DateToplistService),
      db,
      chains,
      calendarDates,
    };
  }

  it('returns the rows the query produces, descending', async () => {
    const { service } = await build();
    await expect(
      service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('returns the rows the query produces, ascending', async () => {
    const { service } = await build();
    await expect(
      service.getMatchCountsByDateAscending(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('ranks the full calendar, so dates with no matches are candidates too', async () => {
    const { service, chains, calendarDates } = await build();
    await service.getMatchCountsByDateAscending(FACT_SCOPE_ALL_TIME, 21);
    expect(calendarDates.allDates).toHaveBeenCalledTimes(1);
    expect(firstCallArg(chains[1].from)).toBe(calendar);
  });

  it('left joins the match counts on month and day, so zero-match dates survive', async () => {
    const { service, chains } = await build();
    await service.getMatchCountsByDateAscending(FACT_SCOPE_ALL_TIME, 21);
    expect(chains[1].leftJoin).toHaveBeenCalledTimes(1);
    const condition = sqlText(firstCallArg(chains[1].leftJoin, 0, 1));
    expect(condition).toContain('"calendar_dates"."month"');
    expect(condition).toContain('"calendar_dates"."day"');
  });

  it('reports a missing match count as zero', async () => {
    const { service, db } = await build();
    await service.getMatchCountsByDateAscending(FACT_SCOPE_ALL_TIME, 21);
    const fields = firstCallArg(db.select, 1) as { count: unknown };
    expect(sqlText(fields.count)).toContain('coalesce');
  });

  it('counts distinct matches, so the match-teams join cannot double-count', async () => {
    const { service, db } = await build();
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    const fields = firstCallArg(db.select) as { count: unknown };
    expect(sqlText(fields.count)).toContain('distinct');
  });

  it('extracts the month and day in UTC, matching the on-this-date filter', async () => {
    const { service, db } = await build();
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    const fields = firstCallArg(db.select) as { month: unknown; day: unknown };
    expect(sqlText(fields.month)).toContain('extract(month from');
    expect(sqlText(fields.month)).toContain("at time zone 'UTC'");
    expect(sqlText(fields.day)).toContain('extract(day from');
    expect(sqlText(fields.day)).toContain("at time zone 'UTC'");
  });

  it('joins matches through match teams, team eras and eras so the scope filter can apply', async () => {
    const { service, chains } = await build();
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['match_teams.match_id', 'matches.id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1))).toEqual(
      ['team_eras.id', 'match_teams.team_era_id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1))).toEqual(
      ['eras.id', 'team_eras.era_id'],
    );
  });

  it('groups the match counts by the extracted month and day', async () => {
    const { service, chains } = await build();
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    expect(chains[0].groupBy).toHaveBeenCalledTimes(1);
    const groupBy = chains[0].groupBy.mock.calls[0];
    expect(sqlText(groupBy[0])).toContain('extract(month from');
    expect(sqlText(groupBy[1])).toContain('extract(day from');
  });

  it('orders the descending toplist by count descending, then chronologically for stable ties', async () => {
    const { service, chains } = await build();
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    const orderBy = chains[1].orderBy.mock.calls[0];
    expect(sqlText(orderBy[0])).toContain('coalesce');
    expect(sqlText(orderBy[0])).toContain(' desc');
    expect(sqlText(orderBy[1])).toContain('"calendar_dates"."month"');
    expect(sqlText(orderBy[2])).toContain('"calendar_dates"."day"');
  });

  it('orders the ascending toplist by count ascending, then chronologically for stable ties', async () => {
    const { service, chains } = await build();
    await service.getMatchCountsByDateAscending(FACT_SCOPE_ALL_TIME, 21);
    const orderBy = chains[1].orderBy.mock.calls[0];
    expect(sqlText(orderBy[0])).toContain(' asc');
    expect(sqlText(orderBy[0])).not.toContain(' desc');
    expect(sqlText(orderBy[1])).toContain('"calendar_dates"."month"');
    expect(sqlText(orderBy[2])).toContain('"calendar_dates"."day"');
  });

  it('applies the caller limit to the ranked calendar, not to the match counts', async () => {
    const { service, chains } = await build();
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    expect(chains[1].limit).toHaveBeenCalledWith(21);
    expect(chains[0].limit).not.toHaveBeenCalled();
  });

  it('applies no filter when the scope is all-time', async () => {
    const { service, chains } = await build();
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    expect(firstCallArg(chains[0].where)).toBeUndefined();
  });

  it('filters by league, era, competition and match category through the shared scope filter', async () => {
    const league = await build();
    await league.service.getMatchCountsByDateDescending({ leagueId: 9 }, 21);
    expect(
      extractAllFilterValues(firstCallArg(league.chains[0].where)),
    ).toContain(9);

    const era = await build();
    await era.service.getMatchCountsByDateDescending({ eraId: 20 }, 21);
    expect(extractAllFilterValues(firstCallArg(era.chains[0].where))).toContain(
      20,
    );

    const competition = await build();
    await competition.service.getMatchCountsByDateAscending(
      { competitionId: 7 },
      21,
    );
    expect(
      extractAllFilterValues(firstCallArg(competition.chains[0].where)),
    ).toContain(7);

    const category = await build();
    await category.service.getMatchCountsByDateAscending(
      { category: 'cup_final' },
      21,
    );
    expect(
      extractAllFilterValues(firstCallArg(category.chains[0].where)),
    ).toContain('cup_final');
  });
});

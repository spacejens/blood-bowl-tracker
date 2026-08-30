import type { DateMatchCount } from '@blood-bowl-tracker/game-data';
import { DateToplistService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  DATE_TOPLIST_NO_DATA_MESSAGE,
  DATE_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { DateButtonIdService } from '../../shared/date-button-id.service';
import { MonthDayService } from '../../shared/month-day.service';
import type { ResolveToplistOptions } from '../leaderboard.service';
import { LeaderboardService } from '../leaderboard.service';
import { DateToplistFactsService } from './date-toplist.service';

interface DateRow {
  month: number;
  day: number;
  name: string;
  count: number;
}

describe('DateToplistFactsService', () => {
  let service: DateToplistFactsService;
  let dates: MockProxy<DateToplistService>;
  let leaderboard: MockProxy<LeaderboardService>;
  let monthDay: MockProxy<MonthDayService>;
  let buttonId: MockProxy<DateButtonIdService>;

  const queryRows: DateMatchCount[] = [
    { month: 2, day: 29, count: 12 },
    { month: 6, day: 1, count: 9 },
  ];

  /** The options the service handed LeaderboardService on the last call. */
  function capturedOptions(): ResolveToplistOptions<DateRow> {
    return leaderboard.resolveToplist.mock
      .calls[0][0] as ResolveToplistOptions<DateRow>;
  }

  beforeEach(async () => {
    dates = mock<DateToplistService>();
    dates.getMatchCountsByDateDescending.mockResolvedValue(queryRows);
    dates.getMatchCountsByDateAscending.mockResolvedValue(queryRows);

    leaderboard = mock<LeaderboardService>();
    leaderboard.resolveToplist.mockResolvedValue('rendered toplist');

    monthDay = mock<MonthDayService>();
    // Sentinel labels, not a copy of MonthDayService's real formatting: this
    // proves each row's name comes from that service without re-deriving what
    // it does, which its own spec covers.
    monthDay.format.mockImplementation(
      (value) => `formatted ${value.month}/${value.day}`,
    );

    buttonId = mock<DateButtonIdService>();
    buttonId.encode.mockReturnValue('encoded-id');

    const moduleRef = await Test.createTestingModule({
      providers: [
        DateToplistFactsService,
        { provide: DateToplistService, useValue: dates },
        { provide: LeaderboardService, useValue: leaderboard },
        { provide: MonthDayService, useValue: monthDay },
        { provide: DateButtonIdService, useValue: buttonId },
      ],
    }).compile();
    service = moduleRef.get(DateToplistFactsService);
  });

  it('titles the descending toplist and returns what the leaderboard renders', async () => {
    await expect(service.resolveMatchesDescending({})).resolves.toBe(
      'rendered toplist',
    );
    expect(capturedOptions().title).toBe(
      'Dates by matches played (descending)',
    );
  });

  it('titles the ascending toplist', async () => {
    await service.resolveMatchesAscending({});
    expect(capturedOptions().title).toBe('Dates by matches played (ascending)');
  });

  it('passes the timeout and no-data messages through', async () => {
    await service.resolveMatchesDescending({});
    expect(capturedOptions().timeoutMessage).toBe(DATE_TOPLIST_TIMEOUT_MESSAGE);
    expect(capturedOptions().noDataMessage).toBe(DATE_TOPLIST_NO_DATA_MESSAGE);
  });

  it('does not override formatRow, so rows render like every other plain-count toplist', async () => {
    await service.resolveMatchesDescending({});
    expect(capturedOptions().formatRow).toBeUndefined();
  });

  it('fetches descending rows for the scope and names each date via MonthDayService', async () => {
    await service.resolveMatchesDescending({ eraId: 12 });
    const rows = await capturedOptions().fetchRows(21);
    expect(dates.getMatchCountsByDateDescending).toHaveBeenCalledWith(
      { eraId: 12 },
      21,
    );
    expect(rows).toEqual([
      { month: 2, day: 29, name: 'formatted 2/29', count: 12 },
      { month: 6, day: 1, name: 'formatted 6/1', count: 9 },
    ]);
  });

  it('fetches ascending rows for the scope', async () => {
    await service.resolveMatchesAscending({ leagueId: 5 });
    await capturedOptions().fetchRows(21);
    expect(dates.getMatchCountsByDateAscending).toHaveBeenCalledWith(
      { leagueId: 5 },
      21,
    );
  });

  it('links each row to the on-this-date prefix', async () => {
    await service.resolveMatchesDescending({});
    expect(capturedOptions().entityLink?.customIdPrefix).toBe(
      ON_THIS_DATE_BUTTON_CUSTOM_ID_PREFIX,
    );
  });

  it('builds each row entity id from the row date and the toplist scope, so the button carries the scope', async () => {
    await service.resolveMatchesDescending({ competitionId: 7 });
    const entityId = capturedOptions().entityLink?.entityId({
      month: 2,
      day: 29,
      name: 'formatted 2/29',
      count: 12,
    });
    expect(entityId).toBe('encoded-id');
    expect(buttonId.encode).toHaveBeenCalledWith(
      { month: 2, day: 29 },
      { competitionId: 7 },
    );
  });
});

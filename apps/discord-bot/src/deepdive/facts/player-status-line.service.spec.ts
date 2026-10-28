import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PlayerStatusLineService } from './player-status-line.service';

const TODAY = new Date('2026-10-27T12:00:00.000Z');
const ENDED_YESTERDAY = '2026-10-26';
const ENDING_TODAY = '2026-10-27';
const ENDING_TOMORROW = '2026-10-28';

describe('PlayerStatusLineService', () => {
  let service: PlayerStatusLineService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerStatusLineService],
    }).compile();
    service = moduleRef.get(PlayerStatusLineService);
  });

  function line(
    status: PlayerStatus | null,
    eraEndDate: string | null,
    today: Date = TODAY,
  ): string {
    return service.build({ status, eraEndDate, today });
  }

  it.each([
    ['active', 'Status: Active'],
    ['temporarily_retired', 'Status: Temporarily retired'],
    ['retired', 'Status: Retired'],
    ['dead', 'Status: Killed'],
    [null, 'Status: Unknown'],
  ] as const)('shows %s in an ongoing era as "%s"', (status, expected) => {
    expect(line(status, null)).toBe(expected);
  });

  it.each([
    ['active', 'Status: Active until the end of the era'],
    [
      'temporarily_retired',
      'Status: Temporarily retired until the end of the era',
    ],
    ['retired', 'Status: Retired'],
    ['dead', 'Status: Killed'],
    [null, 'Status: Unknown'],
  ] as const)(
    'shows %s in an era that ended yesterday as "%s"',
    (status, expected) => {
      expect(line(status, ENDED_YESTERDAY)).toBe(expected);
    },
  );

  it('treats an era ending today as not yet ended', () => {
    expect(line('active', ENDING_TODAY)).toBe('Status: Active');
    expect(line('temporarily_retired', ENDING_TODAY)).toBe(
      'Status: Temporarily retired',
    );
  });

  it('treats an era with a future end date as not yet ended', () => {
    expect(line('active', ENDING_TOMORROW)).toBe('Status: Active');
    expect(line('temporarily_retired', ENDING_TOMORROW)).toBe(
      'Status: Temporarily retired',
    );
  });

  it('reads today as the UTC date', () => {
    // 23:30 at UTC-5 on the 27th is already the 28th in UTC.
    const lateEvening = new Date('2026-10-27T23:30:00.000-05:00');

    expect(line('active', ENDING_TODAY, lateEvening)).toBe(
      'Status: Active until the end of the era',
    );
  });
});

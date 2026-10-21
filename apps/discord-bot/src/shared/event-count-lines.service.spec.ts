import type { PlayerDeepdiveCategoryCounts } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EventCountLinesService } from './event-count-lines.service';
import { NumberFormatterService } from './number-formatter.service';

/**
 * Test-only factory for building counts with sensible defaults.
 * Defaults: empty simple array, all groups with zero totals and sub-counts.
 */
function counts(
  overrides: Partial<PlayerDeepdiveCategoryCounts> = {},
): PlayerDeepdiveCategoryCounts {
  return {
    simple: [],
    casualties: { total: 0, seriousInjuries: 0, killed: 0 },
    fouls: { total: 0, seriousInjuries: 0, killed: 0 },
    ...overrides,
  };
}

describe('EventCountLinesService', () => {
  let service: EventCountLinesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      // Pure chain: both services are pure, so both are real.
      providers: [EventCountLinesService, NumberFormatterService],
    }).compile();
    service = moduleRef.get(EventCountLinesService);
  });

  it('renders each non-zero simple category in order and drops the zero ones', () => {
    const result = service.build(
      counts({
        simple: [
          { label: 'Touchdowns scored', count: 3 },
          { label: 'Interceptions', count: 0 },
          { label: 'Completions', count: 1 },
        ],
      }),
      'No events recorded',
    );

    expect(result).toEqual(['Touchdowns scored: 3', 'Completions: 1']);
  });

  it('uses the singular for exactly one serious injury', () => {
    expect(
      service.build(
        counts({ fouls: { total: 2, seriousInjuries: 1, killed: 1 } }),
        'none',
      ),
    ).toEqual(['Fouls committed: 2 (1 serious injury, 1 killed)']);
  });

  it('groups large counts with thousands separators', () => {
    expect(
      service.build(
        counts({
          simple: [{ label: 'Touchdowns scored', count: 1234 }],
          casualties: { total: 5678, seriousInjuries: 1200, killed: 1001 },
        }),
        'none',
      ),
    ).toEqual([
      'Touchdowns scored: 1,234',
      'Casualties inflicted: 5,678 (1,200 serious injuries, 1,001 killed)',
    ]);
  });

  it('breaks a group line down by severity', () => {
    const result = service.build(
      counts({
        fouls: { total: 7, seriousInjuries: 3, killed: 2 },
      }),
      'No events recorded',
    );

    expect(result).toEqual([
      'Fouls committed: 7 (3 serious injuries, 2 killed)',
    ]);
  });

  it('drops a zero sub-count from the parenthetical', () => {
    const result = service.build(
      counts({
        casualties: { total: 4, seriousInjuries: 0, killed: 1 },
      }),
      'No events recorded',
    );

    expect(result).toEqual(['Casualties inflicted: 4 (1 killed)']);
  });

  it('drops the parenthetical entirely when both sub-counts are zero', () => {
    const result = service.build(
      counts({
        casualties: { total: 4, seriousInjuries: 0, killed: 0 },
      }),
      'No events recorded',
    );

    expect(result).toEqual(['Casualties inflicted: 4']);
  });

  it('drops a group line whose total is zero', () => {
    const result = service.build(
      counts({
        simple: [{ label: 'MVP awards', count: 1 }],
        casualties: { total: 0, seriousInjuries: 0, killed: 0 },
      }),
      'No events recorded',
    );

    expect(result).toEqual(['MVP awards: 1']);
    expect(result).not.toContain('Casualties inflicted');
  });

  it("falls back to the caller's placeholder when every counter is zero", () => {
    const result = service.build(counts(), 'This player did nothing');

    expect(result).toEqual(['This player did nothing']);
  });
});

import type { PlayerDeepdiveCategoryCounts } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EventCountLinesService } from './event-count-lines.service';

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
      providers: [EventCountLinesService],
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

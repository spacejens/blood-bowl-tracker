import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeout,
} from '../database-timeout-mock.test-helpers';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  POSITION_BUTTON_CUSTOM_ID_PREFIX,
} from '../deepdive/button-custom-ids';
import { EntityComponentsService } from '../entity-components.service';
import { entityComponentsMock } from '../entity-components-mock.test-helpers';
import {
  MAX_EXACT_TIE_REMAINDER,
  MAX_LEADERBOARD_ENTRIES,
  TOPLIST_FETCH_LIMIT,
} from './leaderboard.service';
import { LeaderboardService } from './leaderboard.service';

let databaseTimeout: MockProxy<DatabaseTimeoutService>;
let entityComponents: MockProxy<EntityComponentsService>;
let leaderboardService: LeaderboardService;

function service(): LeaderboardService {
  return leaderboardService;
}

/**
 * Compiles a fresh LeaderboardService, optionally with a caller-supplied
 * EntityComponentsService mock (defaulting to one whose buildEntityComponents
 * returns an empty, non-overflowing result).
 */
async function makeService(
  components: MockProxy<EntityComponentsService> = entityComponentsMock(),
): Promise<LeaderboardService> {
  entityComponents = components;
  const moduleRef = await Test.createTestingModule({
    providers: [
      LeaderboardService,
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return moduleRef.get(LeaderboardService);
}

beforeEach(async () => {
  databaseTimeout = mockDatabaseTimeout();
  entityComponents = entityComponentsMock();
  entityComponents.buildEntityComponents.mockReturnValue({
    components: [],
    overflowNote: null,
  });
  // Individual tests that need the timeout branch override this per-call.
  leaderboardService = await makeService(entityComponents);
});

describe('TOPLIST_FETCH_LIMIT', () => {
  it('is MAX_LEADERBOARD_ENTRIES + MAX_EXACT_TIE_REMAINDER + 1', () => {
    expect(TOPLIST_FETCH_LIMIT).toBe(
      MAX_LEADERBOARD_ENTRIES + MAX_EXACT_TIE_REMAINDER + 1,
    );
    // 10 shown + 10 exact-remainder headroom + 1 sentinel = 21
    expect(TOPLIST_FETCH_LIMIT).toBe(21);
  });
});

describe('topRanksWithTies', () => {
  it('assigns sequential ranks when there are no ties', () => {
    const rows = [
      { name: 'a', count: 9 },
      { name: 'b', count: 5 },
      { name: 'c', count: 2 },
    ];
    expect(service().topRanksWithTies(rows, 5, 50)).toEqual({
      rows: [
        { name: 'a', count: 9, rank: 1 },
        { name: 'b', count: 5, rank: 2 },
        { name: 'c', count: 2, rank: 3 },
      ],
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
  });

  it('gives tied rows the same dense rank and continues at the next integer', () => {
    const rows = [
      { name: 'a', count: 9 },
      { name: 'b', count: 9 },
      { name: 'c', count: 4 },
    ];
    expect(service().topRanksWithTies(rows, 5, 50)).toEqual({
      rows: [
        { name: 'a', count: 9, rank: 1 },
        { name: 'b', count: 9, rank: 1 },
        { name: 'c', count: 4, rank: 2 },
      ],
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
  });

  it('keeps ties that push the list past topEntries', () => {
    const rows = [
      { name: 'a', count: 9 },
      { name: 'b', count: 7 },
      { name: 'c', count: 7 },
      { name: 'd', count: 1 },
    ];
    expect(service().topRanksWithTies(rows, 2, 50)).toEqual({
      rows: [
        { name: 'a', count: 9, rank: 1 },
        { name: 'b', count: 7, rank: 2 },
        { name: 'c', count: 7, rank: 2 },
      ],
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
  });

  it('returns all rows when there are fewer than topEntries', () => {
    const rows = [{ name: 'a', count: 3 }];
    expect(service().topRanksWithTies(rows, 5, 50)).toEqual({
      rows: [{ name: 'a', count: 3, rank: 1 }],
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
  });

  it('returns an empty array for no rows', () => {
    expect(service().topRanksWithTies([], 5, 50)).toEqual({
      rows: [],
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
  });

  it('hard-caps the number of rendered rows even within a single massive tie', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({
      name: `team-${i}`,
      count: 1,
    }));
    const result = service().topRanksWithTies(rows, 5, 50);
    expect(result.rows).toHaveLength(50);
    expect(result.rows.every((row) => row.rank === 1)).toBe(true);
    expect(result.truncatedCount).toBe(250);
    expect(result.tieGroupOpenEnded).toBe(true);
  });

  it('does not report truncation when the cap lands exactly on the last row', () => {
    const rows = [
      { name: 'a', count: 2 },
      { name: 'b', count: 1 },
    ];
    expect(service().topRanksWithTies(rows, 5, 2)).toEqual({
      rows: [
        { name: 'a', count: 2, rank: 1 },
        { name: 'b', count: 1, rank: 2 },
      ],
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
  });

  it('extends the top entries to include a tie, then stops at the first differing count', () => {
    // 15,14,12,12,11,11,10,10 — position 5 lands on the first 11; the second 11
    // ties so it is kept, but the following 10 breaks the tie and stops the list.
    const rows = [
      { name: 'a', count: 15 },
      { name: 'b', count: 14 },
      { name: 'c', count: 12 },
      { name: 'd', count: 12 },
      { name: 'e', count: 11 },
      { name: 'f', count: 11 },
      { name: 'g', count: 10 },
      { name: 'h', count: 10 },
    ];
    expect(service().topRanksWithTies(rows, 5, 10)).toEqual({
      rows: [
        { name: 'a', count: 15, rank: 1 },
        { name: 'b', count: 14, rank: 2 },
        { name: 'c', count: 12, rank: 3 },
        { name: 'd', count: 12, rank: 3 },
        { name: 'e', count: 11, rank: 4 },
        { name: 'f', count: 11, rank: 4 },
      ],
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
  });

  it('cuts a boundary tie group exactly at the entry cap and reports the remainder', () => {
    // 4 leading entries then a 7-way tie (positions 5–11). topEntries=5 opens the
    // tie at position 5; the cap of 10 admits 6 of the 7 tied rows, truncating 1.
    const rows = [
      { name: 'a', count: 20 },
      { name: 'b', count: 19 },
      { name: 'c', count: 18 },
      { name: 'd', count: 17 },
      { name: 't0', count: 5 },
      { name: 't1', count: 5 },
      { name: 't2', count: 5 },
      { name: 't3', count: 5 },
      { name: 't4', count: 5 },
      { name: 't5', count: 5 },
      { name: 't6', count: 5 },
    ];
    expect(service().topRanksWithTies(rows, 5, 10)).toEqual({
      rows: [
        { name: 'a', count: 20, rank: 1 },
        { name: 'b', count: 19, rank: 2 },
        { name: 'c', count: 18, rank: 3 },
        { name: 'd', count: 17, rank: 4 },
        { name: 't0', count: 5, rank: 5 },
        { name: 't1', count: 5, rank: 5 },
        { name: 't2', count: 5, rank: 5 },
        { name: 't3', count: 5, rank: 5 },
        { name: 't4', count: 5, rank: 5 },
        { name: 't5', count: 5, rank: 5 },
      ],
      truncatedCount: 1,
      tieGroupOpenEnded: true,
    });
  });

  it('flags an open-ended tie group when the boundary tie consumes every input row', () => {
    // topEntries lands on the first `5`; every remaining row also `5`, so the
    // boundary tie never breaks before the input ends.
    const rows = [
      { name: 'a', count: 9 },
      { name: 'b', count: 8 },
      { name: 'c', count: 7 },
      { name: 'd', count: 6 },
      { name: 'e', count: 5 },
      { name: 'f', count: 5 },
      { name: 'g', count: 5 },
    ];
    expect(service().topRanksWithTies(rows, 5, 10).tieGroupOpenEnded).toBe(
      true,
    );
  });

  it('does not flag open-ended when the boundary tie breaks before the input ends', () => {
    // topEntries lands on the first `5`; the boundary tie breaks on the `4`.
    const rows = [
      { name: 'a', count: 9 },
      { name: 'b', count: 8 },
      { name: 'c', count: 7 },
      { name: 'd', count: 6 },
      { name: 'e', count: 5 },
      { name: 'f', count: 5 },
      { name: 'g', count: 4 },
    ];
    expect(service().topRanksWithTies(rows, 5, 10).tieGroupOpenEnded).toBe(
      false,
    );
  });
});

describe('formatLeaderboardEmbed', () => {
  it('builds an embed with one line per ranked row', () => {
    const result = service().formatLeaderboardEmbed({
      title: 'Coaches by matches',
      rankedRows: [
        { name: 'a', count: 9, rank: 1 },
        { name: 'b', count: 9, rank: 1 },
        { name: 'c', count: 4, rank: 2 },
      ],
      noDataMessage: 'No data placeholder',
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches',
          description: '1. a — 9\n1. b — 9\n2. c — 4',
        },
      ],
    });
  });

  it('uses the supplied no-data message when there are no rows', () => {
    const result = service().formatLeaderboardEmbed({
      title: 'Coaches by matches',
      rankedRows: [],
      noDataMessage: 'Nobody has laced up their boots yet.',
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches',
          description: 'Nobody has laced up their boots yet.',
        },
      ],
    });
  });

  it('appends a truncation note when rows were cut off by the entry cap', () => {
    const result = service().formatLeaderboardEmbed({
      title: 'Teams by eras active',
      rankedRows: [
        { name: 'a', count: 2, rank: 1 },
        { name: 'b', count: 2, rank: 1 },
      ],
      noDataMessage: 'No data placeholder',
      tieRemainder: { type: 'exact', count: 250 },
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by eras active',
          description: '1. a — 2\n1. b — 2\n…and 250 more tied.',
        },
      ],
    });
  });

  it('renders an exact tie remainder as a numbered "more tied" line', () => {
    const result = service().formatLeaderboardEmbed({
      title: 'Teams by eras active',
      rankedRows: [
        { name: 'a', count: 2, rank: 1 },
        { name: 'b', count: 2, rank: 1 },
      ],
      noDataMessage: 'No data placeholder',
      tieRemainder: { type: 'exact', count: 7 },
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by eras active',
          description: '1. a — 2\n1. b — 2\n…and 7 more tied.',
        },
      ],
    });
  });

  it('renders an approximate tie remainder as "lots more tied"', () => {
    const result = service().formatLeaderboardEmbed({
      title: 'Teams by eras active',
      rankedRows: [{ name: 'a', count: 2, rank: 1 }],
      noDataMessage: 'No data placeholder',
      tieRemainder: { type: 'approximate' },
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by eras active',
          description: '1. a — 2\n…and lots more tied.',
        },
      ],
    });
  });

  it('omits the remainder line for an exact count of zero', () => {
    const result = service().formatLeaderboardEmbed({
      title: 'Teams by eras active',
      rankedRows: [{ name: 'a', count: 2, rank: 1 }],
      noDataMessage: 'No data placeholder',
      tieRemainder: { type: 'exact', count: 0 },
    });
    expect(result).toEqual({
      embeds: [{ title: 'Teams by eras active', description: '1. a — 2' }],
    });
  });

  it('omits components entirely when no entityLink is configured', () => {
    const result = service().formatLeaderboardEmbed({
      title: 'Coaches',
      rankedRows: [{ coachId: 7, name: 'Roze Madder', count: 9, rank: 1 }],
      noDataMessage: 'no data',
    });
    expect(entityComponents.buildEntityComponents).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('components');
  });

  it('hands one entry per ranked row to EntityComponentsService and returns its components', async () => {
    const cannedComponents = [{ type: 1, components: [] }];
    const components = entityComponentsMock();
    components.buildEntityComponents.mockReturnValue({
      components: cannedComponents,
      overflowNote: null,
    });
    const localService = await makeService(components);
    const result = localService.formatLeaderboardEmbed({
      title: 'Coaches by matches played',
      rankedRows: [
        { coachId: 7, name: 'Roze Madder', count: 9, rank: 1 },
        { coachId: 8, name: 'Grashnak', count: 4, rank: 2 },
      ],
      noDataMessage: 'no data',
      entityLink: {
        customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
        entityId: (row) => row.coachId,
      },
    });
    expect(components.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '7',
        label: 'Roze Madder',
      },
      {
        customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '8',
        label: 'Grashnak',
      },
    ]);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played',
          description: '1. Roze Madder — 9\n2. Grashnak — 4',
        },
      ],
      components: cannedComponents,
    });
  });

  it('uses entityLink.label to build the component label when supplied, overriding row.name', async () => {
    const cannedComponents = [{ type: 1, components: [] }];
    const components = entityComponentsMock();
    components.buildEntityComponents.mockReturnValue({
      components: cannedComponents,
      overflowNote: null,
    });
    const localService = await makeService(components);
    localService.formatLeaderboardEmbed({
      title: 'Positions by players',
      rankedRows: [
        {
          positionId: 1,
          name: 'Lineman',
          raceName: 'Orc',
          count: 120,
          rank: 1,
        },
        {
          positionId: 2,
          name: 'Lineman',
          raceName: 'Human',
          count: 90,
          rank: 2,
        },
      ],
      noDataMessage: 'no data',
      entityLink: {
        customIdPrefix: POSITION_BUTTON_CUSTOM_ID_PREFIX,
        entityId: (row) => row.positionId,
        label: (row) => `${row.name} (${row.raceName})`,
      },
    });
    expect(components.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: POSITION_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'Lineman (Orc)',
      },
      {
        customIdPrefix: POSITION_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '2',
        label: 'Lineman (Human)',
      },
    ]);
  });

  it('appends the overflow note to the description when entries did not fit', async () => {
    const components = entityComponentsMock();
    components.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 2 more without a link.',
    });
    const localService = await makeService(components);
    const result = localService.formatLeaderboardEmbed({
      title: 'Coaches',
      rankedRows: [{ coachId: 7, name: 'Roze Madder', count: 9, rank: 1 }],
      noDataMessage: 'no data',
      entityLink: {
        customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
        entityId: (row) => row.coachId,
      },
    }) as { embeds: { description: string }[] };
    expect(result.embeds[0].description).toBe(
      '1. Roze Madder — 9\n…and 2 more without a link.',
    );
  });

  it('renders each line via a supplied formatRow', () => {
    const result = service().formatLeaderboardEmbed({
      title: 'Teams by money lost to expensive mistakes',
      rankedRows: [
        { name: 'a', count: 150000, rank: 1 },
        { name: 'b', count: 40000, rank: 2 },
      ],
      noDataMessage: 'No data placeholder',
      formatRow: (row) =>
        `${row.rank}. ${row.name} — ${row.count.toLocaleString('en-US')} gp`,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by money lost to expensive mistakes',
          description: '1. a — 150,000 gp\n2. b — 40,000 gp',
        },
      ],
    });
  });
});

describe('resolveToplist', () => {
  it('applies the default top-entry and cap thresholds to a large tie group', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      name: `t${i}`,
      count: 1,
    }));
    const result = await service().resolveToplist({
      title: 'Teams by eras active',
      fetchRows: () => Promise.resolve(rows),
      timeoutMessage: 'timeout placeholder',
      noDataMessage: 'no-data placeholder',
    });
    const expectedLines = [
      ...Array.from({ length: 10 }, (_, i) => `1. t${i} — 1`),
      '…and 5 more tied.',
    ];
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by eras active',
          description: expectedLines.join('\n'),
        },
      ],
    });
  });

  it('threads entityLink through to EntityComponentsService', async () => {
    const rows = [
      { coachId: 1, name: 'a', count: 9 },
      { coachId: 2, name: 'b', count: 4 },
    ];
    await service().resolveToplist({
      title: 'Coaches by matches',
      fetchRows: () => Promise.resolve(rows),
      timeoutMessage: 'timeout placeholder',
      noDataMessage: 'no-data placeholder',
      entityLink: {
        customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
        entityId: (row) => row.coachId,
      },
    });
    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'a',
      },
      {
        customIdPrefix: COACH_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '2',
        label: 'b',
      },
    ]);
  });

  it('threads formatRow through to the embed lines', async () => {
    const rows = [{ teamId: 1, name: 'a', count: 150000 }];
    const result = await service().resolveToplist({
      title: 'Teams by money lost to expensive mistakes',
      fetchRows: () => Promise.resolve(rows),
      timeoutMessage: 'timeout placeholder',
      noDataMessage: 'no-data placeholder',
      formatRow: (row) =>
        `${row.rank}. ${row.name} — ${row.count.toLocaleString('en-US')} gp`,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by money lost to expensive mistakes',
          description: '1. a — 150,000 gp',
        },
      ],
    });
  });

  it('reports an exact remainder when the fetch returns fewer than the limit', async () => {
    // 12 rows all tied: below the 21-row window, so the remainder is exact.
    const rows = Array.from({ length: 12 }, (_, i) => ({
      name: `t${i}`,
      count: 1,
    }));
    const result = await service().resolveToplist({
      title: 'Teams by eras active',
      fetchRows: () => Promise.resolve(rows),
      timeoutMessage: 'timeout placeholder',
      noDataMessage: 'no-data placeholder',
    });
    const expectedLines = [
      ...Array.from({ length: 10 }, (_, i) => `1. t${i} — 1`),
      '…and 2 more tied.',
    ];
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by eras active',
          description: expectedLines.join('\n'),
        },
      ],
    });
  });

  it('reports an exact remainder when a saturated fetch’s boundary tie resolves within the window', async () => {
    // 21 rows fetched (saturated). Positions 5–12 are an 8-way tie at 50; the
    // boundary tie opens at position 5 and breaks on the 40 at position 13, so
    // the remainder is exactly countable (2 tied rows past the 10-row cap) and
    // must NOT render as "lots more tied".
    const rows = [
      { name: 'a', count: 100 },
      { name: 'b', count: 90 },
      { name: 'c', count: 80 },
      { name: 'd', count: 70 },
      { name: 't0', count: 50 },
      { name: 't1', count: 50 },
      { name: 't2', count: 50 },
      { name: 't3', count: 50 },
      { name: 't4', count: 50 },
      { name: 't5', count: 50 },
      { name: 't6', count: 50 },
      { name: 't7', count: 50 },
      { name: 'u0', count: 40 },
      { name: 'u1', count: 39 },
      { name: 'u2', count: 38 },
      { name: 'u3', count: 37 },
      { name: 'u4', count: 36 },
      { name: 'u5', count: 35 },
      { name: 'u6', count: 34 },
      { name: 'u7', count: 33 },
      { name: 'u8', count: 32 },
    ];
    expect(rows).toHaveLength(TOPLIST_FETCH_LIMIT); // guard: fetch is saturated
    const result = await service().resolveToplist({
      title: 'Teams by eras active',
      fetchRows: () => Promise.resolve(rows),
      timeoutMessage: 'timeout placeholder',
      noDataMessage: 'no-data placeholder',
    });
    const expectedLines = [
      '1. a — 100',
      '2. b — 90',
      '3. c — 80',
      '4. d — 70',
      '5. t0 — 50',
      '5. t1 — 50',
      '5. t2 — 50',
      '5. t3 — 50',
      '5. t4 — 50',
      '5. t5 — 50',
      '…and 2 more tied.',
    ];
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by eras active',
          description: expectedLines.join('\n'),
        },
      ],
    });
  });

  it('requests exactly TOPLIST_FETCH_LIMIT rows from fetchRows', async () => {
    const fetchRows = vi.fn().mockResolvedValue([{ name: 'a', count: 1 }]);
    await service().resolveToplist({
      title: 'Teams by eras active',
      fetchRows,
      timeoutMessage: 'timeout placeholder',
      noDataMessage: 'no-data placeholder',
    });
    expect(fetchRows).toHaveBeenCalledWith(TOPLIST_FETCH_LIMIT);
  });

  it('reports an approximate remainder and drops the sentinel when the fetch is saturated', async () => {
    // Exactly TOPLIST_FETCH_LIMIT (21) rows: the last row is a sentinel proving
    // the true set is larger, so the remainder is approximate and the sentinel is
    // excluded from ranking (only 10 rows are rendered).
    const rows = Array.from({ length: TOPLIST_FETCH_LIMIT }, (_, i) => ({
      name: `t${i}`,
      count: 1,
    }));
    const result = (await service().resolveToplist({
      title: 'Teams by eras active',
      fetchRows: () => Promise.resolve(rows),
      timeoutMessage: 'timeout placeholder',
      noDataMessage: 'no-data placeholder',
    })) as { embeds: { description: string }[] };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toHaveLength(11); // 10 rendered rows + 1 remainder line
    expect(lines[10]).toBe('…and lots more tied.');
    expect(lines).not.toContain(`1. t${TOPLIST_FETCH_LIMIT - 1} — 1`); // sentinel excluded
  });

  it('falls back to the timeout message when fetchRows does not settle in time', async () => {
    // Exercises the branch where DatabaseTimeoutService's real "run" would
    // resolve with the fallback (null) instead of the work — the actual
    // timeout race is DatabaseTimeoutService's own responsibility and is
    // covered by database-timeout.service.spec.ts.
    stubDatabaseTimeout(databaseTimeout);
    const result = await service().resolveToplist({
      title: 'Teams by eras active',
      fetchRows: () => new Promise<{ name: string; count: number }[]>(() => {}),
      timeoutMessage: 'timeout placeholder',
      noDataMessage: 'no-data placeholder',
    });
    expect(result).toBe('timeout placeholder');
  });
});

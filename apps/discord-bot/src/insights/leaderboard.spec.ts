import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import {
  formatLeaderboardEmbed,
  MAX_EXACT_TIE_REMAINDER,
  MAX_LEADERBOARD_ENTRIES,
  resolveToplist,
  TOPLIST_FETCH_LIMIT,
  topRanksWithTies,
} from './leaderboard';

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
    expect(topRanksWithTies(rows, 5, 50)).toEqual({
      rows: [
        { name: 'a', count: 9, rank: 1 },
        { name: 'b', count: 5, rank: 2 },
        { name: 'c', count: 2, rank: 3 },
      ],
      truncatedCount: 0,
    });
  });

  it('gives tied rows the same dense rank and continues at the next integer', () => {
    const rows = [
      { name: 'a', count: 9 },
      { name: 'b', count: 9 },
      { name: 'c', count: 4 },
    ];
    expect(topRanksWithTies(rows, 5, 50)).toEqual({
      rows: [
        { name: 'a', count: 9, rank: 1 },
        { name: 'b', count: 9, rank: 1 },
        { name: 'c', count: 4, rank: 2 },
      ],
      truncatedCount: 0,
    });
  });

  it('keeps ties that push the list past topEntries', () => {
    const rows = [
      { name: 'a', count: 9 },
      { name: 'b', count: 7 },
      { name: 'c', count: 7 },
      { name: 'd', count: 1 },
    ];
    expect(topRanksWithTies(rows, 2, 50)).toEqual({
      rows: [
        { name: 'a', count: 9, rank: 1 },
        { name: 'b', count: 7, rank: 2 },
        { name: 'c', count: 7, rank: 2 },
      ],
      truncatedCount: 0,
    });
  });

  it('returns all rows when there are fewer than topEntries', () => {
    const rows = [{ name: 'a', count: 3 }];
    expect(topRanksWithTies(rows, 5, 50)).toEqual({
      rows: [{ name: 'a', count: 3, rank: 1 }],
      truncatedCount: 0,
    });
  });

  it('returns an empty array for no rows', () => {
    expect(topRanksWithTies([], 5, 50)).toEqual({
      rows: [],
      truncatedCount: 0,
    });
  });

  it('hard-caps the number of rendered rows even within a single massive tie', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({
      name: `team-${i}`,
      count: 1,
    }));
    const result = topRanksWithTies(rows, 5, 50);
    expect(result.rows).toHaveLength(50);
    expect(result.rows.every((row) => row.rank === 1)).toBe(true);
    expect(result.truncatedCount).toBe(250);
  });

  it('does not report truncation when the cap lands exactly on the last row', () => {
    const rows = [
      { name: 'a', count: 2 },
      { name: 'b', count: 1 },
    ];
    expect(topRanksWithTies(rows, 5, 2)).toEqual({
      rows: [
        { name: 'a', count: 2, rank: 1 },
        { name: 'b', count: 1, rank: 2 },
      ],
      truncatedCount: 0,
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
    expect(topRanksWithTies(rows, 5, 10)).toEqual({
      rows: [
        { name: 'a', count: 15, rank: 1 },
        { name: 'b', count: 14, rank: 2 },
        { name: 'c', count: 12, rank: 3 },
        { name: 'd', count: 12, rank: 3 },
        { name: 'e', count: 11, rank: 4 },
        { name: 'f', count: 11, rank: 4 },
      ],
      truncatedCount: 0,
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
    expect(topRanksWithTies(rows, 5, 10)).toEqual({
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
    });
  });
});

describe('formatLeaderboardEmbed', () => {
  it('builds an embed with one line per ranked row', () => {
    const result = formatLeaderboardEmbed({
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
    const result = formatLeaderboardEmbed({
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
    const result = formatLeaderboardEmbed({
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
    const result = formatLeaderboardEmbed({
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
    const result = formatLeaderboardEmbed({
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
    const result = formatLeaderboardEmbed({
      title: 'Teams by eras active',
      rankedRows: [{ name: 'a', count: 2, rank: 1 }],
      noDataMessage: 'No data placeholder',
      tieRemainder: { type: 'exact', count: 0 },
    });
    expect(result).toEqual({
      embeds: [{ title: 'Teams by eras active', description: '1. a — 2' }],
    });
  });

  it('omits components entirely when no buildCustomId is supplied', () => {
    const result = formatLeaderboardEmbed({
      title: 'Coaches by matches',
      rankedRows: [{ name: 'a', count: 9, rank: 1 }],
      noDataMessage: 'No data placeholder',
    });
    expect(result).not.toHaveProperty('components');
  });

  it('emits one Primary button per ranked row when buildCustomId is supplied', () => {
    const result = formatLeaderboardEmbed({
      title: 'Coaches by matches',
      rankedRows: [
        { name: 'a', count: 9, rank: 1, coachId: 1 },
        { name: 'b', count: 4, rank: 2, coachId: 2 },
      ],
      noDataMessage: 'No data placeholder',
      buildCustomId: (row) => `deepdive:coach:${row.coachId}`,
    });
    expect(result.components).toEqual([
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Primary,
            label: 'a',
            custom_id: 'deepdive:coach:1',
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Primary,
            label: 'b',
            custom_id: 'deepdive:coach:2',
          },
        ],
      },
    ]);
  });

  it('chunks buttons into action rows of at most five', () => {
    const rankedRows = Array.from({ length: 7 }, (_, i) => ({
      name: `c${i}`,
      count: 10 - i,
      rank: i + 1,
      coachId: i + 1,
    }));
    const result = formatLeaderboardEmbed({
      title: 'Coaches by matches',
      rankedRows,
      noDataMessage: 'No data placeholder',
      buildCustomId: (row) => `deepdive:coach:${row.coachId}`,
    });
    const components = result.components as
      { components: unknown[] }[] | undefined;
    expect(components).toHaveLength(2);
    expect(components?.[0].components).toHaveLength(5);
    expect(components?.[1].components).toHaveLength(2);
  });

  it('adds no components for an empty result even with buildCustomId', () => {
    const result = formatLeaderboardEmbed({
      title: 'Coaches by matches',
      rankedRows: [],
      noDataMessage: 'Nobody yet.',
      buildCustomId: (row: { name: string; count: number; rank: number }) =>
        `deepdive:coach:${row.name}`,
    });
    expect(result).not.toHaveProperty('components');
  });

  it('renders each line via a supplied formatRow', () => {
    const result = formatLeaderboardEmbed({
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

  it('builds at most one button per distinct custom_id', () => {
    const result = formatLeaderboardEmbed({
      title: 'Biggest expensive mistakes',
      rankedRows: [
        { name: 'a', count: 90000, rank: 1, teamId: 1 },
        { name: 'a', count: 60000, rank: 2, teamId: 1 },
        { name: 'b', count: 50000, rank: 3, teamId: 2 },
      ],
      noDataMessage: 'No data placeholder',
      buildCustomId: (row) => `deepdive:team:${row.teamId}`,
    });
    const buttons = (
      result.components as unknown as { components: { custom_id: string }[] }[]
    ).flatMap((r) => r.components);
    expect(buttons.map((b) => b.custom_id)).toEqual([
      'deepdive:team:1',
      'deepdive:team:2',
    ]);
  });
});

describe('resolveToplist', () => {
  it('applies the default top-entry and cap thresholds to a large tie group', async () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      name: `t${i}`,
      count: 1,
    }));
    const result = await resolveToplist({
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

  it('threads buildCustomId through to per-row buttons', async () => {
    const rows = [
      { coachId: 1, name: 'a', count: 9 },
      { coachId: 2, name: 'b', count: 4 },
    ];
    const result = (await resolveToplist({
      title: 'Coaches by matches',
      fetchRows: () => Promise.resolve(rows),
      timeoutMessage: 'timeout placeholder',
      noDataMessage: 'no-data placeholder',
      buildCustomId: (row) => `deepdive:coach:${row.coachId}`,
    })) as unknown as {
      components: { components: { custom_id: string }[] }[];
    };
    const customIds = result.components.flatMap((r) =>
      r.components.map((b) => b.custom_id),
    );
    expect(customIds).toEqual(['deepdive:coach:1', 'deepdive:coach:2']);
  });

  it('threads formatRow through to the embed lines', async () => {
    const rows = [{ teamId: 1, name: 'a', count: 150000 }];
    const result = await resolveToplist({
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
    const result = await resolveToplist({
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

  it('requests exactly TOPLIST_FETCH_LIMIT rows from fetchRows', async () => {
    const fetchRows = vi.fn().mockResolvedValue([{ name: 'a', count: 1 }]);
    await resolveToplist({
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
    const result = (await resolveToplist({
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
});

import { describe, expect, it } from 'vitest';

import {
  formatLeaderboardEmbed,
  resolveToplist,
  topRanksWithTies,
} from './leaderboard';

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
    const result = formatLeaderboardEmbed('Coaches by matches', [
      { name: 'a', count: 9, rank: 1 },
      { name: 'b', count: 9, rank: 1 },
      { name: 'c', count: 4, rank: 2 },
    ]);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches',
          description: '1. a — 9\n1. b — 9\n2. c — 4',
        },
      ],
    });
  });

  it('uses a placeholder description when there are no rows', () => {
    const result = formatLeaderboardEmbed('Coaches by matches', []);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches',
          description: 'No data recorded yet.',
        },
      ],
    });
  });

  it('appends a truncation note when rows were cut off by the entry cap', () => {
    const result = formatLeaderboardEmbed(
      'Teams by eras active',
      [
        { name: 'a', count: 2, rank: 1 },
        { name: 'b', count: 2, rank: 1 },
      ],
      250,
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by eras active',
          description: '1. a — 2\n1. b — 2\n…and 250 more tied.',
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
    const result = await resolveToplist('Teams by eras active', () =>
      Promise.resolve(rows),
    );
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
});

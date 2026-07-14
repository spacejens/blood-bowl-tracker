import { describe, expect, it } from 'vitest';

import { formatLeaderboardEmbed, topRanksWithTies } from './leaderboard';

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

  it('keeps ties that push the list past maxRank', () => {
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

  it('returns all rows when there are fewer than maxRank', () => {
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

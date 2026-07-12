import { describe, expect, it, vi } from 'vitest';

import { resolveStatsSummary } from './stats-summary';
import type { StatsSummaryDeps } from './stats-summary';

function makeDeps(
  overrides: Partial<Record<string, unknown>> = {},
): StatsSummaryDeps {
  return {
    leagues: { countAll: vi.fn().mockResolvedValue(3) },
    externalSystems: { countAll: vi.fn().mockResolvedValue(2) },
    rulesSets: { countAll: vi.fn().mockResolvedValue(2) },
    races: { countAll: vi.fn().mockResolvedValue(24) },
    positions: { countAll: vi.fn().mockResolvedValue(120) },
    coaches: { countAll: vi.fn().mockResolvedValue(42) },
    eras: { countAll: vi.fn().mockResolvedValue(15) },
    competitions: {
      countAll: vi.fn().mockResolvedValue(12),
      countByType: vi.fn((t: string) =>
        Promise.resolve(t === 'season' ? 8 : 4),
      ),
    },
    teams: { countAll: vi.fn().mockResolvedValue(87) },
    players: { countAll: vi.fn().mockResolvedValue(640) },
    matches: {
      countAll: vi.fn().mockResolvedValue(310),
      countMatchEvents: vi.fn().mockResolvedValue(5200),
    },
    ...overrides,
  } as unknown as StatsSummaryDeps;
}

describe('resolveStatsSummary', () => {
  it('renders one embed row per entity type in the specified order with thousands separators', async () => {
    const result = await resolveStatsSummary(makeDeps());
    expect(result).toEqual({
      embeds: [
        {
          title: 'I have knowledge of',
          description: [
            'Leagues: 3',
            'External systems: 2',
            'Rules sets: 2',
            'Races: 24',
            'Positions: 120',
            'Coaches: 42',
            'Eras: 15',
            'Competitions: 12 (8 seasons, 4 cups)',
            'Teams: 87',
            'Players: 640',
            'Matches: 310',
            'Match events: 5,200',
          ].join('\n'),
        },
      ],
    });
  });

  it('falls back to "I am stunned" when a count does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      const deps = makeDeps({
        matches: {
          countAll: vi.fn().mockReturnValue(new Promise(() => {})),
          countMatchEvents: vi.fn().mockResolvedValue(0),
        },
      });
      const promise = resolveStatsSummary(deps);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});

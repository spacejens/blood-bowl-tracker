import { describe, expect, it, vi } from 'vitest';

import type { StatsSummaryDeps } from './stats-summary';
import { resolveStatsSummary } from './stats-summary';
import { expectStunnedOnTimeout } from './toplist.test-helpers';

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
          title: 'Statistics',
          description: [
            'Leagues: 3',
            'Eras: 15',
            'External systems: 2',
            'Rules sets: 2',
            'Races: 24',
            'Positions: 120',
            'Coaches: 42',
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
    await expectStunnedOnTimeout(
      (deps: StatsSummaryDeps) => resolveStatsSummary(deps),
      () =>
        makeDeps({
          matches: {
            countAll: vi.fn().mockReturnValue(new Promise(() => {})),
            countMatchEvents: vi.fn().mockResolvedValue(0),
          },
        }),
    );
  });
});

function makeEraDeps(
  overrides: Partial<Record<string, unknown>> = {},
): StatsSummaryDeps {
  return {
    leagues: { countAll: vi.fn() },
    externalSystems: { countByEra: vi.fn().mockResolvedValue(2) },
    rulesSets: { countAll: vi.fn() },
    races: { countByEra: vi.fn().mockResolvedValue(10) },
    positions: { countByEra: vi.fn().mockResolvedValue(50) },
    coaches: { countByEra: vi.fn().mockResolvedValue(6) },
    eras: { getRulesSetNames: vi.fn().mockResolvedValue(['BB2020', 'BB2016']) },
    competitions: {
      countByEra: vi.fn().mockResolvedValue(5),
      countByType: vi.fn((t: string) =>
        Promise.resolve(t === 'season' ? 3 : 2),
      ),
    },
    teams: { countByEra: vi.fn().mockResolvedValue(12) },
    players: { countByEra: vi.fn().mockResolvedValue(140) },
    matches: {
      countByEra: vi.fn().mockResolvedValue(30),
      countMatchEventsByEra: vi.fn().mockResolvedValue(500),
    },
    ...overrides,
  } as unknown as StatsSummaryDeps;
}

describe('resolveStatsSummary era-filtered', () => {
  it('renders the era-scoped lines, showing leagues/eras as 1 and replacing external systems and rules sets', async () => {
    const result = await resolveStatsSummary(makeEraDeps(), 5);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Statistics',
          description: [
            'Leagues: 1',
            'Eras: 1',
            'External systems: 2',
            'Rules sets: 2',
            'Races: 10',
            'Positions: 50',
            'Coaches: 6',
            'Competitions: 5 (3 seasons, 2 cups)',
            'Teams: 12',
            'Players: 140',
            'Matches: 30',
            'Match events: 500',
          ].join('\n'),
        },
      ],
    });
  });

  it('renders "0" for the rules sets line when the era has no rules sets', async () => {
    const result = await resolveStatsSummary(
      makeEraDeps({
        eras: { getRulesSetNames: vi.fn().mockResolvedValue([]) },
      }),
      5,
    );
    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description).toContain('Rules sets: 0');
  });

  it('scopes external systems by era (excluding the Name system via countByEra)', async () => {
    const deps = makeEraDeps();
    await resolveStatsSummary(deps, 5);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(deps.externalSystems.countByEra).toHaveBeenCalledWith(5);
  });

  it('falls back to the stunned message when an era count times out', async () => {
    await expectStunnedOnTimeout(
      (deps: StatsSummaryDeps) => resolveStatsSummary(deps, 5),
      () =>
        makeEraDeps({
          matches: {
            countByEra: vi.fn().mockReturnValue(new Promise(() => {})),
            countMatchEventsByEra: vi.fn().mockResolvedValue(0),
          },
        }),
    );
  });
});

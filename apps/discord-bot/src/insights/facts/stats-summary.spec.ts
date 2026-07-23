import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  STATS_SUMMARY_ALL_TIME_TIMEOUT_MESSAGE,
  STATS_SUMMARY_COMPETITION_NOT_FOUND_MESSAGE,
  STATS_SUMMARY_COMPETITION_TIMEOUT_MESSAGE,
  STATS_SUMMARY_ERA_TIMEOUT_MESSAGE,
  STATS_SUMMARY_LEAGUE_TIMEOUT_MESSAGE,
} from '../../error-messages';
import type { StatsSummaryDeps } from './stats-summary';
import { resolveStatsSummary } from './stats-summary';
import { expectTimeoutFallback } from './toplist.test-helpers';

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
    const result = await resolveStatsSummary(makeDeps(), FACT_SCOPE_ALL_TIME);
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

  it('falls back to the all-time timeout message when a count does not respond in time', async () => {
    await expectTimeoutFallback(
      (deps: StatsSummaryDeps) =>
        resolveStatsSummary(deps, FACT_SCOPE_ALL_TIME),
      () =>
        makeDeps({
          matches: {
            countAll: vi.fn().mockReturnValue(new Promise(() => {})),
            countMatchEvents: vi.fn().mockResolvedValue(0),
          },
        }),
      STATS_SUMMARY_ALL_TIME_TIMEOUT_MESSAGE,
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
    const result = await resolveStatsSummary(makeEraDeps(), { eraId: 5 });
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
      { eraId: 5 },
    );
    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description).toContain('Rules sets: 0');
  });

  it('scopes external systems by era (excluding the Name system via countByEra)', async () => {
    const deps = makeEraDeps();
    await resolveStatsSummary(deps, { eraId: 5 });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(deps.externalSystems.countByEra).toHaveBeenCalledWith(5);
  });

  it('falls back to the stunned message when an era count times out', async () => {
    await expectTimeoutFallback(
      (deps: StatsSummaryDeps) => resolveStatsSummary(deps, { eraId: 5 }),
      () =>
        makeEraDeps({
          matches: {
            countByEra: vi.fn().mockReturnValue(new Promise(() => {})),
            countMatchEventsByEra: vi.fn().mockResolvedValue(0),
          },
        }),
      STATS_SUMMARY_ERA_TIMEOUT_MESSAGE,
    );
  });
});

function makeCompetitionDeps(
  overrides: Partial<Record<string, unknown>> = {},
): StatsSummaryDeps {
  return {
    leagues: { countAll: vi.fn() },
    externalSystems: { countByCompetition: vi.fn().mockResolvedValue(2) },
    rulesSets: { countAll: vi.fn() },
    races: { countByCompetition: vi.fn().mockResolvedValue(4) },
    positions: { countByCompetition: vi.fn().mockResolvedValue(20) },
    coaches: { countByCompetition: vi.fn().mockResolvedValue(6) },
    eras: { getRulesSetNames: vi.fn().mockResolvedValue(['BB2020']) },
    competitions: {
      findById: vi.fn().mockResolvedValue({
        id: 7,
        name: 'Major Season 24',
        type: 'season',
        eraId: 5,
      }),
    },
    teams: { countByCompetition: vi.fn().mockResolvedValue(8) },
    players: { countByCompetition: vi.fn().mockResolvedValue(90) },
    matches: {
      countByCompetition: vi.fn().mockResolvedValue(15),
      countMatchEventsByCompetition: vi.fn().mockResolvedValue(250),
    },
    ...overrides,
  } as unknown as StatsSummaryDeps;
}

describe('resolveStatsSummary competition-filtered', () => {
  it('renders competition-scoped lines with leagues/eras/competitions as 1 and a season breakdown', async () => {
    const result = await resolveStatsSummary(makeCompetitionDeps(), {
      competitionId: 7,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Statistics',
          description: [
            'Leagues: 1',
            'Eras: 1',
            'External systems: 2',
            'Rules sets: 1',
            'Races: 4',
            'Positions: 20',
            'Coaches: 6',
            'Competitions: 1 (1 seasons, 0 cups)',
            'Teams: 8',
            'Players: 90',
            'Matches: 15',
            'Match events: 250',
          ].join('\n'),
        },
      ],
    });
  });

  it('shows a cup breakdown when the competition type is cup', async () => {
    const result = await resolveStatsSummary(
      makeCompetitionDeps({
        competitions: {
          findById: vi.fn().mockResolvedValue({
            id: 8,
            name: 'Spike Cup',
            type: 'cup',
            eraId: 5,
          }),
        },
      }),
      { competitionId: 8 },
    );
    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description).toContain('Competitions: 1 (0 seasons, 1 cups)');
  });

  it('reuses the era rules-set names keyed by the competition era', async () => {
    const deps = makeCompetitionDeps();
    await resolveStatsSummary(deps, { competitionId: 7 });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(deps.eras.getRulesSetNames).toHaveBeenCalledWith(5);
  });

  it('returns the fallback message when the competition cannot be found', async () => {
    const result = await resolveStatsSummary(
      makeCompetitionDeps({
        competitions: { findById: vi.fn().mockResolvedValue(undefined) },
      }),
      { competitionId: 999 },
    );
    expect(result).toBe(STATS_SUMMARY_COMPETITION_NOT_FOUND_MESSAGE);
  });

  it('falls back to the stunned message when a competition count times out', async () => {
    await expectTimeoutFallback(
      (deps: StatsSummaryDeps) =>
        resolveStatsSummary(deps, { competitionId: 7 }),
      () =>
        makeCompetitionDeps({
          matches: {
            countByCompetition: vi.fn().mockReturnValue(new Promise(() => {})),
            countMatchEventsByCompetition: vi.fn().mockResolvedValue(0),
          },
        }),
      STATS_SUMMARY_COMPETITION_TIMEOUT_MESSAGE,
    );
  });
});

function makeLeagueDeps(
  overrides: Partial<Record<string, unknown>> = {},
): StatsSummaryDeps {
  return {
    leagues: { countAll: vi.fn() },
    externalSystems: { countByLeague: vi.fn().mockResolvedValue(3) },
    rulesSets: { countAll: vi.fn() },
    races: { countByLeague: vi.fn().mockResolvedValue(18) },
    positions: { countByLeague: vi.fn().mockResolvedValue(90) },
    coaches: { countByLeague: vi.fn().mockResolvedValue(10) },
    eras: {
      countByLeague: vi.fn().mockResolvedValue(4),
      getRulesSetNamesByLeague: vi.fn().mockResolvedValue(['BB2016', 'BB2020']),
    },
    competitions: {
      countByLeague: vi.fn().mockResolvedValue(9),
      countByType: vi.fn((t: string) =>
        Promise.resolve(t === 'season' ? 6 : 3),
      ),
    },
    teams: { countByLeague: vi.fn().mockResolvedValue(22) },
    players: { countByLeague: vi.fn().mockResolvedValue(260) },
    matches: {
      countByLeague: vi.fn().mockResolvedValue(70),
      countMatchEventsByLeague: vi.fn().mockResolvedValue(900),
    },
    ...overrides,
  } as unknown as StatsSummaryDeps;
}

describe('resolveStatsSummary league-filtered', () => {
  it('renders the league-scoped lines, showing leagues as 1 and the league era count', async () => {
    const result = await resolveStatsSummary(makeLeagueDeps(), {
      leagueId: 9,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Statistics',
          description: [
            'Leagues: 1',
            'Eras: 4',
            'External systems: 3',
            'Rules sets: 2',
            'Races: 18',
            'Positions: 90',
            'Coaches: 10',
            'Competitions: 9 (6 seasons, 3 cups)',
            'Teams: 22',
            'Players: 260',
            'Matches: 70',
            'Match events: 900',
          ].join('\n'),
        },
      ],
    });
  });

  it('renders "0" for the rules sets line when the league has no rules sets', async () => {
    const result = await resolveStatsSummary(
      makeLeagueDeps({
        eras: {
          countByLeague: vi.fn().mockResolvedValue(0),
          getRulesSetNamesByLeague: vi.fn().mockResolvedValue([]),
        },
      }),
      { leagueId: 9 },
    );
    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description).toContain('Rules sets: 0');
  });

  it('scopes external systems by league (excluding the Name system via countByLeague)', async () => {
    const deps = makeLeagueDeps();
    await resolveStatsSummary(deps, { leagueId: 9 });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(deps.externalSystems.countByLeague).toHaveBeenCalledWith(9);
  });

  it('falls back to the stunned message when a league count times out', async () => {
    await expectTimeoutFallback(
      (deps: StatsSummaryDeps) => resolveStatsSummary(deps, { leagueId: 9 }),
      () =>
        makeLeagueDeps({
          matches: {
            countByLeague: vi.fn().mockReturnValue(new Promise(() => {})),
            countMatchEventsByLeague: vi.fn().mockResolvedValue(0),
          },
        }),
      STATS_SUMMARY_LEAGUE_TIMEOUT_MESSAGE,
    );
  });
});

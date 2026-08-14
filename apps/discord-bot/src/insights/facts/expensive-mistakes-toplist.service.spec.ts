import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import { TeamsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { TEAM_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { TeamContextService } from '../team-context.service';
import { ExpensiveMistakesToplistService } from './expensive-mistakes-toplist.service';
import { MatchCategoryLabelService } from './match-category-label.service';

interface MadeService {
  service: ExpensiveMistakesToplistService;
  leaderboard: MockProxy<LeaderboardService>;
  categoryLabel: MockProxy<MatchCategoryLabelService>;
  teamContext: MockProxy<TeamContextService>;
}

async function makeService(
  teams: TeamsService,
  teamContext: MockProxy<TeamContextService> = mock<TeamContextService>(),
): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const categoryLabel = mock<MatchCategoryLabelService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      ExpensiveMistakesToplistService,
      { provide: TeamsService, useValue: teams },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: MatchCategoryLabelService, useValue: categoryLabel },
      { provide: TeamContextService, useValue: teamContext },
    ],
  }).compile();
  return {
    service: moduleRef.get(ExpensiveMistakesToplistService),
    leaderboard,
    categoryLabel,
    teamContext,
  };
}

interface MistakeRow {
  teamId: number;
  name: string;
  count: number;
  contextSuffix?: string;
}

interface BiggestMistakeRow extends MistakeRow {
  date: string;
  category: MatchCategory;
}

function capturedFormatRow(
  leaderboard: MockProxy<LeaderboardService>,
): (row: BiggestMistakeRow & { rank: number }) => string {
  const options = leaderboard.resolveToplist.mock
    .calls[0][0] as unknown as ResolveToplistOptions<BiggestMistakeRow>;
  return options.formatRow as (
    row: BiggestMistakeRow & { rank: number },
  ) => string;
}

describe('ExpensiveMistakesToplistService.resolveTotal', () => {
  // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
  // rendering) is covered by leaderboard.service.spec.ts. Here `leaderboard`
  // is a mock returning a canned reply, so this test asserts only what
  // ExpensiveMistakesToplistService itself owns: the embed title, its
  // gp-suffixed formatRow closure, and its per-row deepdive button id.
  it('wires the embed title, gp-suffixed formatRow, and per-row deepdive button id', async () => {
    const teams = mock<TeamsService>();
    teams.sumExpensiveMistakesByTeam.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams);
    const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
    leaderboard.resolveToplist.mockResolvedValueOnce(canned);
    const result = await service.resolveTotal({});
    expect(result).toBe(canned);
    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<MistakeRow>;
    expect(options.title).toBe('Teams by money lost to expensive mistakes');
    expect(options.entityLink?.customIdPrefix).toBe(
      TEAM_BUTTON_CUSTOM_ID_PREFIX,
    );
    expect(
      options.entityLink?.entityId({
        teamId: 1,
        name: '40 grinders',
        count: 0,
      }),
    ).toBe(1);
    expect(
      options.formatRow?.({
        teamId: 1,
        name: '40 grinders',
        count: 150000,
        rank: 1,
      }),
    ).toBe('1. 40 grinders — 150,000 gp');
  });

  it('passes era and competition ids through to the query', async () => {
    const teams = mock<TeamsService>();
    teams.sumExpensiveMistakesByTeam.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveTotal({
      eraId: 20,
      competitionId: 30,
    });
    expect(teams.sumExpensiveMistakesByTeam).toHaveBeenCalledWith(
      { eraId: 20, competitionId: 30 },
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
    const teams = mock<TeamsService>();
    teams.sumExpensiveMistakesByTeam.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockResolvedValueOnce(
      TEAM_TOPLIST_TIMEOUT_MESSAGE,
    );
    const result = await service.resolveTotal({});
    expect(result).toBe(TEAM_TOPLIST_TIMEOUT_MESSAGE);
    expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE }),
    );
  });

  it('decorates every fetched row with both race and coach context', async () => {
    const rawRows = [{ teamId: 1, name: '40 grinders', count: 150000 }];
    const teams = mock<TeamsService>();
    teams.sumExpensiveMistakesByTeam.mockResolvedValue(rawRows);
    const teamContext = mock<TeamContextService>();
    teamContext.attachSuffixes.mockResolvedValue(
      rawRows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
    );
    const { service, leaderboard } = await makeService(teams, teamContext);
    let fetched: unknown;
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      fetched = await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveTotal({});
    expect(teamContext.attachSuffixes).toHaveBeenCalledTimes(1);
    const [inputRows, teamIdOf, contextOptions] =
      teamContext.attachSuffixes.mock.calls[0];
    expect(inputRows).toEqual(rawRows);
    expect(teamIdOf(rawRows[0])).toBe(1);
    expect(contextOptions).toEqual({ includeRace: true, includeCoach: true });
    expect(fetched).toEqual(
      rawRows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
    );
  });

  it('renders the context suffix between the name and the gp amount', async () => {
    const teams = mock<TeamsService>();
    teams.sumExpensiveMistakesByTeam.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');
    await service.resolveTotal({});
    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<MistakeRow>;
    expect(
      options.formatRow?.({
        teamId: 1,
        name: '40 grinders',
        count: 150000,
        contextSuffix: ' (Orc, Skarsnik)',
        rank: 1,
      }),
    ).toBe('1. 40 grinders (Orc, Skarsnik) — 150,000 gp');
  });
});

describe('ExpensiveMistakesToplistService.resolveBiggest', () => {
  // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
  // rendering, and per-row button dedupe) is covered by
  // leaderboard.service.spec.ts. Here `leaderboard` is a mock returning a
  // canned reply, so this test asserts only what
  // ExpensiveMistakesToplistService itself owns: the embed title, its
  // gp-and-date formatRow closure, and its per-row deepdive button id.
  it('wires the embed title, gp-and-date formatRow, and per-row deepdive button id', async () => {
    const teams = mock<TeamsService>();
    teams.listBiggestExpensiveMistakes.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams);
    const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
    leaderboard.resolveToplist.mockResolvedValueOnce(canned);
    const result = await service.resolveBiggest({});
    expect(result).toBe(canned);
    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<BiggestMistakeRow>;
    expect(options.title).toBe('Biggest expensive mistakes');
    expect(options.entityLink?.customIdPrefix).toBe(
      TEAM_BUTTON_CUSTOM_ID_PREFIX,
    );
    expect(
      options.entityLink?.entityId({
        teamId: 1,
        name: '40 grinders',
        count: 0,
        date: '2026-03-04',
        category: 'normal',
      }),
    ).toBe(1);
    expect(
      options.formatRow?.({
        teamId: 1,
        name: '40 grinders',
        count: 90000,
        date: '2026-03-04',
        category: 'normal',
        rank: 1,
      }),
    ).toBe('1. 40 grinders — 90,000 gp (2026-03-04)');
  });

  it('passes era and competition ids through to the query', async () => {
    const teams = mock<TeamsService>();
    teams.listBiggestExpensiveMistakes.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveBiggest({
      eraId: 20,
      competitionId: 30,
    });
    expect(teams.listBiggestExpensiveMistakes).toHaveBeenCalledWith(
      { eraId: 20, competitionId: 30 },
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
    const teams = mock<TeamsService>();
    teams.listBiggestExpensiveMistakes.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockResolvedValueOnce(
      TEAM_TOPLIST_TIMEOUT_MESSAGE,
    );
    const result = await service.resolveBiggest({});
    expect(result).toBe(TEAM_TOPLIST_TIMEOUT_MESSAGE);
    expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE }),
    );
  });

  it('appends the category to the date suffix when it is not normal', async () => {
    const teams = mock<TeamsService>();
    teams.listBiggestExpensiveMistakes.mockResolvedValue([]);
    const { service, leaderboard, categoryLabel } = await makeService(teams);
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');
    categoryLabel.label.mockReturnValue('Season Final');
    await service.resolveBiggest({});
    const formatRow = capturedFormatRow(leaderboard);
    expect(
      formatRow({
        rank: 1,
        teamId: 4,
        name: '40 grinders',
        count: 90000,
        date: '2026-06-13',
        category: 'season_final',
      }),
    ).toBe('1. 40 grinders — 90,000 gp (2026-06-13, Season Final)');
  });

  it('leaves the category out of the suffix when it is normal', async () => {
    const teams = mock<TeamsService>();
    teams.listBiggestExpensiveMistakes.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');
    await service.resolveBiggest({});
    const formatRow = capturedFormatRow(leaderboard);
    expect(
      formatRow({
        rank: 1,
        teamId: 4,
        name: '40 grinders',
        count: 90000,
        date: '2026-06-13',
        category: 'normal',
      }),
    ).toBe('1. 40 grinders — 90,000 gp (2026-06-13)');
  });

  it('decorates every fetched row with both race and coach context', async () => {
    const rawRows = [
      {
        teamId: 4,
        name: '40 grinders',
        count: 90000,
        date: '2026-06-13',
        category: 'normal' as const,
      },
    ];
    const teams = mock<TeamsService>();
    teams.listBiggestExpensiveMistakes.mockResolvedValue(rawRows);
    const teamContext = mock<TeamContextService>();
    teamContext.attachSuffixes.mockResolvedValue(
      rawRows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
    );
    const { service, leaderboard } = await makeService(teams, teamContext);
    let fetched: unknown;
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      fetched = await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveBiggest({});
    expect(teamContext.attachSuffixes).toHaveBeenCalledTimes(1);
    const [inputRows, teamIdOf, contextOptions] =
      teamContext.attachSuffixes.mock.calls[0];
    expect(inputRows).toEqual(rawRows);
    expect(teamIdOf(rawRows[0])).toBe(4);
    expect(contextOptions).toEqual({ includeRace: true, includeCoach: true });
    expect(fetched).toEqual(
      rawRows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
    );
  });

  it('renders the context suffix between the name and the gp amount, before the date parenthetical', async () => {
    const teams = mock<TeamsService>();
    teams.listBiggestExpensiveMistakes.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');
    await service.resolveBiggest({});
    const formatRow = capturedFormatRow(leaderboard);
    expect(
      formatRow({
        rank: 1,
        teamId: 4,
        name: '40 grinders',
        count: 90000,
        date: '2026-06-13',
        category: 'normal',
        contextSuffix: ' (Orc, Skarsnik)',
      }),
    ).toBe('1. 40 grinders (Orc, Skarsnik) — 90,000 gp (2026-06-13)');
  });
});

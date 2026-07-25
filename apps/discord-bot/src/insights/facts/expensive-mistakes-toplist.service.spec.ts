import { TeamsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { TEAM_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { ExpensiveMistakesToplistService } from './expensive-mistakes-toplist.service';

interface MadeService {
  service: ExpensiveMistakesToplistService;
  leaderboard: MockProxy<LeaderboardService>;
}

async function makeService(teams: TeamsService): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      ExpensiveMistakesToplistService,
      { provide: TeamsService, useValue: teams },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return {
    service: moduleRef.get(ExpensiveMistakesToplistService),
    leaderboard,
  };
}

interface MistakeRow {
  teamId: number;
  name: string;
  count: number;
}

interface BiggestMistakeRow extends MistakeRow {
  date: string;
}

describe('ExpensiveMistakesToplistService.resolveTotal', () => {
  // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
  // rendering) is covered by leaderboard.service.spec.ts. Here `leaderboard`
  // is a mock returning a canned reply, so this test asserts only what
  // ExpensiveMistakesToplistService itself owns: the embed title, its
  // gp-suffixed formatRow closure, and its per-row deepdive button id.
  it('wires the embed title, gp-suffixed formatRow, and per-row deepdive button id', async () => {
    const teams = {
      sumExpensiveMistakesByTeam: vi.fn().mockResolvedValue([]),
    } as unknown as TeamsService;
    const { service, leaderboard } = await makeService(teams);
    const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
    leaderboard.resolveToplist.mockResolvedValueOnce(canned);
    const result = await service.resolveTotal({});
    expect(result).toBe(canned);
    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<MistakeRow>;
    expect(options.title).toBe('Teams by money lost to expensive mistakes');
    expect(
      options.buildCustomId?.({ teamId: 1, name: '40 grinders', count: 0 }),
    ).toBe(`${TEAM_BUTTON_CUSTOM_ID_PREFIX}1`);
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
    const queryFn = vi.fn().mockResolvedValue([]);
    const teams = {
      sumExpensiveMistakesByTeam: queryFn,
    } as unknown as TeamsService;
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveTotal({
      eraId: 20,
      competitionId: 30,
    });
    expect(queryFn).toHaveBeenCalledWith(
      { eraId: 20, competitionId: 30 },
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
    const teams = {
      sumExpensiveMistakesByTeam: vi.fn().mockResolvedValue([]),
    } as unknown as TeamsService;
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
});

describe('ExpensiveMistakesToplistService.resolveBiggest', () => {
  // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
  // rendering, and per-row button dedupe) is covered by
  // leaderboard.service.spec.ts. Here `leaderboard` is a mock returning a
  // canned reply, so this test asserts only what
  // ExpensiveMistakesToplistService itself owns: the embed title, its
  // gp-and-date formatRow closure, and its per-row deepdive button id.
  it('wires the embed title, gp-and-date formatRow, and per-row deepdive button id', async () => {
    const teams = {
      listBiggestExpensiveMistakes: vi.fn().mockResolvedValue([]),
    } as unknown as TeamsService;
    const { service, leaderboard } = await makeService(teams);
    const canned = { embeds: [{ title: 'canned', description: 'canned' }] };
    leaderboard.resolveToplist.mockResolvedValueOnce(canned);
    const result = await service.resolveBiggest({});
    expect(result).toBe(canned);
    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<BiggestMistakeRow>;
    expect(options.title).toBe('Biggest expensive mistakes');
    expect(
      options.buildCustomId?.({
        teamId: 1,
        name: '40 grinders',
        count: 0,
        date: '2026-03-04',
      }),
    ).toBe(`${TEAM_BUTTON_CUSTOM_ID_PREFIX}1`);
    expect(
      options.formatRow?.({
        teamId: 1,
        name: '40 grinders',
        count: 90000,
        date: '2026-03-04',
        rank: 1,
      }),
    ).toBe('1. 40 grinders — 90,000 gp (2026-03-04)');
  });

  it('passes era and competition ids through to the query', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const teams = {
      listBiggestExpensiveMistakes: queryFn,
    } as unknown as TeamsService;
    const { service, leaderboard } = await makeService(teams);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveBiggest({
      eraId: 20,
      competitionId: 30,
    });
    expect(queryFn).toHaveBeenCalledWith(
      { eraId: 20, competitionId: 30 },
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
    const teams = {
      listBiggestExpensiveMistakes: vi.fn().mockResolvedValue([]),
    } as unknown as TeamsService;
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
});

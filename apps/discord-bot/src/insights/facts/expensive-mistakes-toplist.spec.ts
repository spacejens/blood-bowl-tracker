import type { TeamsService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { TEAM_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../slash-commands/deepdive-command.service';
import { TOPLIST_FETCH_LIMIT } from '../leaderboard';
import {
  resolveTeamExpensiveMistakesBiggestToplist,
  resolveTeamExpensiveMistakesTotalToplist,
} from './expensive-mistakes-toplist';
import { expectTimeoutFallback } from './toplist.test-helpers';

describe('resolveTeamExpensiveMistakesTotalToplist', () => {
  it('renders gp-suffixed totals with one deepdive button per team', async () => {
    const rows = [
      { teamId: 1, name: '40 grinders', count: 150000 },
      { teamId: 2, name: 'Reikland Reavers', count: 40000 },
    ];
    const teams = {
      sumExpensiveMistakesByTeam: vi.fn().mockResolvedValue(rows),
    } as unknown as TeamsService;
    const result = (await resolveTeamExpensiveMistakesTotalToplist(
      teams,
      {},
    )) as unknown as {
      embeds: { title: string; description: string }[];
      components: { components: { label: string; custom_id: string }[] }[];
    };
    expect(result.embeds).toEqual([
      {
        title: 'Teams by money lost to expensive mistakes',
        description:
          '1. 40 grinders — 150,000 gp\n2. Reikland Reavers — 40,000 gp',
      },
    ]);
    const buttons = result.components.flatMap((r) => r.components);
    expect(buttons.map((b) => b.custom_id)).toEqual([
      `${TEAM_BUTTON_CUSTOM_ID_PREFIX}1`,
      `${TEAM_BUTTON_CUSTOM_ID_PREFIX}2`,
    ]);
  });

  it('passes era and competition ids through to the query', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const teams = {
      sumExpensiveMistakesByTeam: queryFn,
    } as unknown as TeamsService;
    await resolveTeamExpensiveMistakesTotalToplist(teams, {
      eraId: 20,
      competitionId: 30,
    });
    expect(queryFn).toHaveBeenCalledWith(
      { eraId: 20, competitionId: 30 },
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('falls back to the timeout message when the query stalls', async () => {
    await expectTimeoutFallback(
      (teams: TeamsService) =>
        resolveTeamExpensiveMistakesTotalToplist(teams, {}),
      () =>
        ({
          sumExpensiveMistakesByTeam: vi
            .fn()
            .mockReturnValue(new Promise(() => {})),
        }) as unknown as TeamsService,
      TEAM_TOPLIST_TIMEOUT_MESSAGE,
    );
  });
});

describe('resolveTeamExpensiveMistakesBiggestToplist', () => {
  it('renders gp-suffixed amounts with dates and dedupes repeated teams', async () => {
    const rows = [
      { teamId: 1, name: '40 grinders', count: 90000, date: '2026-03-04' },
      { teamId: 1, name: '40 grinders', count: 60000, date: '2026-02-01' },
      { teamId: 2, name: 'Gouged Eye', count: 50000, date: '2026-01-10' },
    ];
    const teams = {
      listBiggestExpensiveMistakes: vi.fn().mockResolvedValue(rows),
    } as unknown as TeamsService;
    const result = (await resolveTeamExpensiveMistakesBiggestToplist(
      teams,
      {},
    )) as unknown as {
      embeds: { title: string; description: string }[];
      components: { components: { custom_id: string }[] }[];
    };
    expect(result.embeds).toEqual([
      {
        title: 'Biggest expensive mistakes',
        description:
          '1. 40 grinders — 90,000 gp (2026-03-04)\n' +
          '2. 40 grinders — 60,000 gp (2026-02-01)\n' +
          '3. Gouged Eye — 50,000 gp (2026-01-10)',
      },
    ]);
    const buttons = result.components.flatMap((r) => r.components);
    expect(buttons.map((b) => b.custom_id)).toEqual([
      `${TEAM_BUTTON_CUSTOM_ID_PREFIX}1`,
      `${TEAM_BUTTON_CUSTOM_ID_PREFIX}2`,
    ]);
  });

  it('passes era and competition ids through to the query', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const teams = {
      listBiggestExpensiveMistakes: queryFn,
    } as unknown as TeamsService;
    await resolveTeamExpensiveMistakesBiggestToplist(teams, {
      eraId: 20,
      competitionId: 30,
    });
    expect(queryFn).toHaveBeenCalledWith(
      { eraId: 20, competitionId: 30 },
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('falls back to the timeout message when the query stalls', async () => {
    await expectTimeoutFallback(
      (teams: TeamsService) =>
        resolveTeamExpensiveMistakesBiggestToplist(teams, {}),
      () =>
        ({
          listBiggestExpensiveMistakes: vi
            .fn()
            .mockReturnValue(new Promise(() => {})),
        }) as unknown as TeamsService,
      TEAM_TOPLIST_TIMEOUT_MESSAGE,
    );
  });
});

import type { TeamsService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { resolveTeamDeepdive } from './team-deepdive';

function makeServices(options: {
  team?: {
    id: number;
    name: string;
    raceName: string;
    raceId: number;
    coachName: string;
    coachId: number;
  };
  span?: { start: string; end: string };
  topPlayers?: { playerId: number; name: string; count: number }[];
}): { teams: TeamsService } {
  const teams = {
    findById: vi.fn().mockResolvedValue(options.team),
    getCareerSpan: vi.fn().mockResolvedValue(options.span),
    getTopPlayersByMatchEventCount: vi
      .fn()
      .mockResolvedValue(options.topPlayers ?? []),
  } as unknown as TeamsService;
  return { teams };
}

const grinders = {
  id: 1,
  name: '40 grinders',
  raceName: 'Dwarf',
  raceId: 4,
  coachName: 'Roze Madder',
  coachId: 12,
};

describe('resolveTeamDeepdive', () => {
  it('returns the not-found message when the team does not exist', async () => {
    const result = await resolveTeamDeepdive(
      999,
      makeServices({ team: undefined }),
    );
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
  });

  it('renders the race, coach, career span and top-players list', async () => {
    const services = makeServices({
      team: grinders,
      span: { start: '2021-09-01', end: '2023-06-10' },
      topPlayers: [
        { playerId: 5, name: 'Griff', count: 20 },
        { playerId: 8, name: 'Morg', count: 11 },
      ],
    });
    const result = await resolveTeamDeepdive(1, services);
    expect(result).toEqual({
      embeds: [
        {
          title: '40 grinders',
          description: [
            'Race: Dwarf',
            'Coach: Roze Madder',
            'Career: 2021-09-01 – 2023-06-10',
            '',
            'Top players by match events:',
            '1. Griff — 20',
            '2. Morg — 11',
          ].join('\n'),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Dwarf',
              custom_id: 'deepdive:race:4',
            },
            {
              type: 2,
              style: 1,
              label: 'Roze Madder',
              custom_id: 'deepdive:coach:12',
            },
            {
              type: 2,
              style: 1,
              label: 'Griff',
              custom_id: 'deepdive:player:5',
            },
            {
              type: 2,
              style: 1,
              label: 'Morg',
              custom_id: 'deepdive:player:8',
            },
          ],
        },
      ],
    });
  });

  it('renders a tie group at the cutoff without a truncation note when within the cap', async () => {
    const topPlayers = Array.from({ length: 10 }, (_, i) => ({
      playerId: i + 1,
      name: `P${i}`,
      count: 9,
    }));
    const services = makeServices({
      team: grinders,
      span: { start: '2021-09-01', end: '2023-06-10' },
      topPlayers,
    });
    const result = (await resolveTeamDeepdive(1, services)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    // All ten fetched rows tie at rank 1; the resolver caps rendered entries at
    // MAX_LEADERBOARD_ENTRIES (10), so all ten show and no remainder is noted.
    expect(lines).toContain('1. P0 — 9');
    expect(lines).toContain('1. P9 — 9');
    expect(lines.every((l) => !l.startsWith('…and'))).toBe(true);
  });

  it('shows race, coach and the no-matches message, skipping the top-players section, but still renders race/coach buttons', async () => {
    const services = makeServices({ team: grinders, span: undefined });
    const result = await resolveTeamDeepdive(1, services);
    expect(result).toEqual({
      embeds: [
        {
          title: '40 grinders',
          description: [
            'Race: Dwarf',
            'Coach: Roze Madder',
            DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
          ].join('\n'),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Dwarf',
              custom_id: 'deepdive:race:4',
            },
            {
              type: 2,
              style: 1,
              label: 'Roze Madder',
              custom_id: 'deepdive:coach:12',
            },
          ],
        },
      ],
    });
    // Top-players lookup must not run for a team with no matches.
    const { teams } = services;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.getTopPlayersByMatchEventCount).not.toHaveBeenCalled();
  });

  it('falls back to the team timeout message when the team lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { teams: TeamsService }) => resolveTeamDeepdive(1, services),
      () => ({
        teams: {
          findById: vi.fn().mockReturnValue(new Promise(() => {})),
          getCareerSpan: vi.fn(),
          getTopPlayersByMatchEventCount: vi.fn(),
        } as unknown as TeamsService,
      }),
      DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the career timeout message when the span lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { teams: TeamsService }) => resolveTeamDeepdive(1, services),
      () => ({
        teams: {
          findById: vi.fn().mockResolvedValue(grinders),
          getCareerSpan: vi.fn().mockReturnValue(new Promise(() => {})),
          getTopPlayersByMatchEventCount: vi.fn(),
        } as unknown as TeamsService,
      }),
      DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the players timeout message when the top-players lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { teams: TeamsService }) => resolveTeamDeepdive(1, services),
      () => ({
        teams: {
          findById: vi.fn().mockResolvedValue(grinders),
          getCareerSpan: vi
            .fn()
            .mockResolvedValue({ start: '2021-09-01', end: '2023-06-10' }),
          getTopPlayersByMatchEventCount: vi
            .fn()
            .mockReturnValue(new Promise(() => {})),
        } as unknown as TeamsService,
      }),
      DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
    );
  });

  it('renders race and coach buttons then a Primary button per listed player, keyed by id', async () => {
    const services = makeServices({
      team: {
        id: 1,
        name: 'Reikland Reavers',
        raceName: 'Human',
        raceId: 2,
        coachName: 'Roze',
        coachId: 9,
      },
      span: { start: '2021-09-01', end: '2023-06-10' },
      topPlayers: [
        { playerId: 5, name: 'Griff Oberwald', count: 30 },
        { playerId: 8, name: 'Helmut Wulf', count: 12 },
      ],
    });
    const result = (await resolveTeamDeepdive(1, services)) as unknown as {
      components: { components: { label: string; custom_id: string }[] }[];
    };
    const buttons = result.components.flatMap((row) => row.components);
    expect(buttons).toEqual([
      { type: 2, style: 1, label: 'Human', custom_id: 'deepdive:race:2' },
      { type: 2, style: 1, label: 'Roze', custom_id: 'deepdive:coach:9' },
      {
        type: 2,
        style: 1,
        label: 'Griff Oberwald',
        custom_id: 'deepdive:player:5',
      },
      {
        type: 2,
        style: 1,
        label: 'Helmut Wulf',
        custom_id: 'deepdive:player:8',
      },
    ]);
  });

  it('still renders race and coach buttons when the team has no matches', async () => {
    const services = makeServices({
      team: {
        id: 1,
        name: 'Reikland Reavers',
        raceName: 'Human',
        raceId: 2,
        coachName: 'Roze',
        coachId: 9,
      },
      span: undefined,
    });
    const result = (await resolveTeamDeepdive(1, services)) as unknown as {
      components: { components: { label: string; custom_id: string }[] }[];
    };
    const buttons = result.components.flatMap((row) => row.components);
    expect(buttons.map((b) => b.custom_id)).toEqual([
      'deepdive:race:2',
      'deepdive:coach:9',
    ]);
  });
});

import type { RacesService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_NO_TEAMS_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { resolveRaceDeepdive } from './race-deepdive';

function makeServices(options: {
  race?: { id: number; name: string };
  eraNames?: string[];
  topTeams?: { name: string; count: number }[];
}): { races: RacesService } {
  const races = {
    findById: vi.fn().mockResolvedValue(options.race),
    listEraNames: vi.fn().mockResolvedValue(options.eraNames ?? []),
    getTopTeamsByMatchesPlayed: vi
      .fn()
      .mockResolvedValue(options.topTeams ?? []),
  } as unknown as RacesService;
  return { races };
}

describe('resolveRaceDeepdive', () => {
  it('returns the not-found message when the race does not exist', async () => {
    const result = await resolveRaceDeepdive(
      999,
      makeServices({ race: undefined }),
    );
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
  });

  it('renders the eras list and top-teams list', async () => {
    const services = makeServices({
      race: { id: 1, name: 'Orc' },
      eraNames: ['BB2016', 'BB2020'],
      topTeams: [
        { name: 'Gouged Eye', count: 40 },
        { name: 'Da Deff Skwad', count: 12 },
      ],
    });
    const result = await resolveRaceDeepdive(1, services);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Orc',
          description: [
            'Eras: BB2016, BB2020',
            '',
            'Top teams by matches played:',
            '1. Gouged Eye — 40',
            '2. Da Deff Skwad — 12',
          ].join('\n'),
        },
      ],
    });
  });

  it('shows "None recorded" when the race is linked to no eras', async () => {
    const services = makeServices({
      race: { id: 1, name: 'Orc' },
      eraNames: [],
      topTeams: [{ name: 'Gouged Eye', count: 40 }],
    });
    const result = (await resolveRaceDeepdive(1, services)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')[0]).toBe(
      'Eras: None recorded',
    );
  });

  it('shows the no-teams placeholder when the race has no top teams', async () => {
    const services = makeServices({
      race: { id: 1, name: 'Orc' },
      eraNames: ['BB2020'],
      topTeams: [],
    });
    const result = await resolveRaceDeepdive(1, services);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Orc',
          description: [
            'Eras: BB2020',
            '',
            'Top teams by matches played:',
            DEEPDIVE_RACE_NO_TEAMS_MESSAGE,
          ].join('\n'),
        },
      ],
    });
  });

  it('renders a tie group at the cutoff without a truncation note when ten tie', async () => {
    const topTeams = [
      { name: 'A', count: 9 },
      { name: 'B', count: 9 },
      { name: 'C', count: 9 },
      { name: 'D', count: 9 },
      { name: 'E', count: 9 },
      { name: 'F', count: 9 },
      { name: 'G', count: 9 },
      { name: 'H', count: 9 },
      { name: 'I', count: 9 },
      { name: 'J', count: 9 },
    ];
    const services = makeServices({
      race: { id: 1, name: 'Orc' },
      eraNames: ['BB2020'],
      topTeams,
    });
    const result = (await resolveRaceDeepdive(1, services)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    // All ten fetched rows tie at rank 1; the resolver caps rendered entries at
    // MAX_LEADERBOARD_ENTRIES (10), so all ten show and no remainder is noted.
    expect(lines).toContain('1. A — 9');
    expect(lines).toContain('1. J — 9');
    expect(lines.every((l) => !l.startsWith('…and'))).toBe(true);
  });

  it('falls back to the race timeout message when the race lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { races: RacesService }) => resolveRaceDeepdive(1, services),
      () => ({
        races: {
          findById: vi.fn().mockReturnValue(new Promise(() => {})),
          listEraNames: vi.fn(),
          getTopTeamsByMatchesPlayed: vi.fn(),
        } as unknown as RacesService,
      }),
      DEEPDIVE_RACE_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the eras timeout message when the era-names lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { races: RacesService }) => resolveRaceDeepdive(1, services),
      () => ({
        races: {
          findById: vi.fn().mockResolvedValue({ id: 1, name: 'Orc' }),
          listEraNames: vi.fn().mockReturnValue(new Promise(() => {})),
          getTopTeamsByMatchesPlayed: vi.fn(),
        } as unknown as RacesService,
      }),
      DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the teams timeout message when the top-teams lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { races: RacesService }) => resolveRaceDeepdive(1, services),
      () => ({
        races: {
          findById: vi.fn().mockResolvedValue({ id: 1, name: 'Orc' }),
          listEraNames: vi.fn().mockResolvedValue(['BB2020']),
          getTopTeamsByMatchesPlayed: vi
            .fn()
            .mockReturnValue(new Promise(() => {})),
        } as unknown as RacesService,
      }),
      DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE,
    );
  });
});

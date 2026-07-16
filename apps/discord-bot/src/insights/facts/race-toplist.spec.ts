import type { RacesService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveRaceMatchesPlayedToplist,
  resolveRaceTeamsToplist,
} from './race-toplist';
import {
  expectLeaderboardEmbed,
  expectStunnedOnTimeout,
} from './toplist.test-helpers';

interface RaceCase {
  describeName: string;
  method: keyof RacesService;
  resolve: (races: RacesService, eraId?: number) => Promise<unknown>;
  rows: { raceId: number; name: string; count: number }[];
  eraRows: { raceId: number; name: string; count: number }[];
  expectedTitle: string;
  expectedDescription: string;
}

const cases: RaceCase[] = [
  {
    describeName: 'resolveRaceTeamsToplist',
    method: 'countTeamsByRace',
    resolve: (races, eraId) => resolveRaceTeamsToplist(races, eraId),
    rows: [
      { raceId: 1, name: 'Orc', count: 12 },
      { raceId: 2, name: 'Skaven', count: 12 },
      { raceId: 3, name: 'Elf', count: 4 },
    ],
    eraRows: [{ raceId: 1, name: 'Orc', count: 3 }],
    expectedTitle: 'Races by teams',
    expectedDescription: '1. Orc — 12\n1. Skaven — 12\n2. Elf — 4',
  },
  {
    describeName: 'resolveRaceMatchesPlayedToplist',
    method: 'countMatchesPlayedByRace',
    resolve: (races, eraId) => resolveRaceMatchesPlayedToplist(races, eraId),
    rows: [
      { raceId: 1, name: 'Orc', count: 40 },
      { raceId: 2, name: 'Skaven', count: 18 },
    ],
    eraRows: [{ raceId: 1, name: 'Orc', count: 6 }],
    expectedTitle: 'Races by matches played',
    expectedDescription: '1. Orc — 40\n2. Skaven — 18',
  },
];

describe.each(cases)(
  '$describeName',
  ({ method, resolve, rows, expectedTitle, expectedDescription, eraRows }) => {
    it('returns a leaderboard embed built from the query rows', async () => {
      const races = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as RacesService;
      const result = await resolve(races);
      expectLeaderboardEmbed(result, expectedTitle, expectedDescription);
    });

    it('passes the era id through to the query', async () => {
      const queryFn = vi.fn().mockResolvedValue(eraRows);
      const races = { [method]: queryFn } as unknown as RacesService;
      await resolve(races, 20);
      expect(queryFn).toHaveBeenCalledWith(20);
    });

    it('falls back to "I am stunned" when the query does not respond in time', async () => {
      await expectStunnedOnTimeout(
        (races: RacesService) => resolve(races),
        () =>
          ({
            [method]: vi.fn().mockReturnValue(new Promise(() => {})),
          }) as unknown as RacesService,
      );
    });
  },
);

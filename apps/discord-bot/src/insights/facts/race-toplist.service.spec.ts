import type { FactScope, RacesService } from '@blood-bowl-tracker/game-data';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { RACE_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { RACE_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { RaceToplistService } from './race-toplist.service';
import { expectTimeoutFallback } from './toplist.test-helpers';

function makeService(races: RacesService): RaceToplistService {
  return new RaceToplistService(
    races,
    new LeaderboardService(new DatabaseTimeoutService()),
  );
}

interface RaceCase {
  describeName: string;
  method: keyof RacesService;
  resolve: (service: RaceToplistService, scope: FactScope) => Promise<unknown>;
  rows: { raceId: number; name: string; count: number }[];
  eraRows: { raceId: number; name: string; count: number }[];
  expectedTitle: string;
  expectedDescription: string;
}

const cases: RaceCase[] = [
  {
    describeName: 'resolveTeams',
    method: 'countTeamsByRace',
    resolve: (service, scope) => service.resolveTeams(scope),
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
    describeName: 'resolveMatchesPlayed',
    method: 'countMatchesPlayedByRace',
    resolve: (service, scope) => service.resolveMatchesPlayed(scope),
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
  'RaceToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle, expectedDescription, eraRows }) => {
    it('returns a leaderboard embed with one deepdive button per race row', async () => {
      const races = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as RacesService;
      const result = (await resolve(
        makeService(races),
        FACT_SCOPE_ALL_TIME,
      )) as {
        embeds: { title: string; description: string }[];
        components: { components: { label: string; custom_id: string }[] }[];
      };
      expect(result.embeds).toEqual([
        { title: expectedTitle, description: expectedDescription },
      ]);
      const buttons = result.components.flatMap((row) => row.components);
      expect(buttons.map((b) => b.custom_id)).toEqual(
        rows.map((r) => `${RACE_BUTTON_CUSTOM_ID_PREFIX}${r.raceId}`),
      );
      expect(buttons.map((b) => b.label)).toEqual(rows.map((r) => r.name));
    });

    it('passes the era id through to the query', async () => {
      const queryFn = vi.fn().mockResolvedValue(eraRows);
      const races = { [method]: queryFn } as unknown as RacesService;
      await resolve(makeService(races), { eraId: 20 });
      expect(queryFn).toHaveBeenCalledWith({ eraId: 20 }, TOPLIST_FETCH_LIMIT);
    });

    it('falls back to the timeout message when the query does not respond in time', async () => {
      await expectTimeoutFallback(
        (races: RacesService) =>
          resolve(makeService(races), FACT_SCOPE_ALL_TIME),
        () =>
          ({
            [method]: vi.fn().mockReturnValue(new Promise(() => {})),
          }) as unknown as RacesService,
        RACE_TOPLIST_TIMEOUT_MESSAGE,
      );
    });
  },
);

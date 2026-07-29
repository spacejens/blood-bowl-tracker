import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  FACT_SCOPE_ALL_TIME,
  RacesService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { RACE_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { RACE_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { RaceToplistService } from './race-toplist.service';

interface MadeService {
  service: RaceToplistService;
  leaderboard: MockProxy<LeaderboardService>;
}

async function makeService(races: RacesService): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaceToplistService,
      { provide: RacesService, useValue: races },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(RaceToplistService), leaderboard };
}

interface RaceRow {
  raceId: number;
  name: string;
  count: number;
}

interface RaceCase {
  describeName: string;
  method: keyof RacesService;
  resolve: (service: RaceToplistService, scope: FactScope) => Promise<unknown>;
  rows: RaceRow[];
  eraRows: RaceRow[];
  expectedTitle: string;
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
  },
  {
    describeName: 'resolveMatchesWon',
    method: 'countMatchesWonByRace',
    resolve: (service, scope) => service.resolveMatchesWon(scope),
    rows: [
      { raceId: 1, name: 'Orc', count: 22 },
      { raceId: 2, name: 'Skaven', count: 9 },
    ],
    eraRows: [{ raceId: 1, name: 'Orc', count: 4 }],
    expectedTitle: 'Races by matches won',
  },
  {
    describeName: 'resolveMatchesLost',
    method: 'countMatchesLostByRace',
    resolve: (service, scope) => service.resolveMatchesLost(scope),
    rows: [
      { raceId: 2, name: 'Skaven', count: 15 },
      { raceId: 1, name: 'Orc', count: 6 },
    ],
    eraRows: [{ raceId: 2, name: 'Skaven', count: 2 }],
    expectedTitle: 'Races by matches lost',
  },
  {
    describeName: 'resolveMatchesDrawn',
    method: 'countMatchesDrawnByRace',
    resolve: (service, scope) => service.resolveMatchesDrawn(scope),
    rows: [{ raceId: 3, name: 'Elf', count: 5 }],
    eraRows: [{ raceId: 3, name: 'Elf', count: 1 }],
    expectedTitle: 'Races by matches drawn',
  },
];

describe.each(cases)(
  'RaceToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle, eraRows }) => {
    // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
    // rendering) is covered by leaderboard.service.spec.ts. Here `leaderboard`
    // is a mock returning a canned reply, so this test only asserts what
    // RaceToplistService itself owns: the embed title it configures, and the
    // per-row deepdive entityLink it configures.
    it('wires the embed title and per-row deepdive button id', async () => {
      const races = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as RacesService;
      const { service, leaderboard } = await makeService(races);
      const canned = {
        embeds: [{ title: 'canned', description: 'canned' }],
      };
      leaderboard.resolveToplist.mockResolvedValueOnce(canned);
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(canned);
      const options = leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<RaceRow>;
      expect(options.title).toBe(expectedTitle);
      expect(options.entityLink?.customIdPrefix).toBe(
        RACE_BUTTON_CUSTOM_ID_PREFIX,
      );
      expect(options.entityLink?.entityId(rows[0])).toBe(rows[0].raceId);
    });

    it('passes the era id through to the query', async () => {
      const queryFn = vi.fn().mockResolvedValue(eraRows);
      const races = { [method]: queryFn } as unknown as RacesService;
      const { service, leaderboard } = await makeService(races);
      leaderboard.resolveToplist.mockImplementation(async (options) => {
        await options.fetchRows(TOPLIST_FETCH_LIMIT);
        return 'canned';
      });
      await resolve(service, { eraId: 20 });
      expect(queryFn).toHaveBeenCalledWith({ eraId: 20 }, TOPLIST_FETCH_LIMIT);
    });

    it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
      const races = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as RacesService;
      const { service, leaderboard } = await makeService(races);
      leaderboard.resolveToplist.mockResolvedValueOnce(
        RACE_TOPLIST_TIMEOUT_MESSAGE,
      );
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(RACE_TOPLIST_TIMEOUT_MESSAGE);
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMessage: RACE_TOPLIST_TIMEOUT_MESSAGE,
        }),
      );
    });
  },
);

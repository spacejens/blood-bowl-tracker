import {
  CoachesService,
  FACT_SCOPE_ALL_TIME,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { COACH_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { CoachToplistService } from './coach-toplist.service';

interface MadeService {
  service: CoachToplistService;
  leaderboard: MockProxy<LeaderboardService>;
}

async function makeService(coaches: CoachesService): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      CoachToplistService,
      { provide: CoachesService, useValue: coaches },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(CoachToplistService), leaderboard };
}

interface CoachRow {
  coachId: number;
  name: string;
  count: number;
}

interface ToplistCase {
  describeName: string;
  method: keyof CoachesService;
  resolve: (service: CoachToplistService) => Promise<unknown>;
  rows: CoachRow[];
  expectedTitle: string;
}

const cases: ToplistCase[] = [
  {
    describeName: 'resolveMatchesPlayed',
    method: 'countMatchesPlayedByCoach',
    resolve: (service) => service.resolveMatchesPlayed(FACT_SCOPE_ALL_TIME),
    rows: [
      { coachId: 1, name: 'Roze Madder', count: 9 },
      { coachId: 2, name: 'Grashnak', count: 9 },
      { coachId: 3, name: 'Skabsquik', count: 4 },
    ],
    expectedTitle: 'Coaches by matches played',
  },
  {
    describeName: 'resolveTeams',
    method: 'countTeamsByCoach',
    resolve: (service) => service.resolveTeams(FACT_SCOPE_ALL_TIME),
    rows: [{ coachId: 1, name: 'Roze Madder', count: 3 }],
    expectedTitle: 'Coaches by teams coached',
  },
  {
    describeName: 'resolveCompetitionsPlayed',
    method: 'countCompetitionsByCoach',
    resolve: (service) =>
      service.resolveCompetitionsPlayed(FACT_SCOPE_ALL_TIME),
    rows: [
      { coachId: 1, name: 'Roze Madder', count: 5 },
      { coachId: 2, name: 'Grashnak', count: 2 },
    ],
    expectedTitle: 'Coaches by competitions played',
  },
  {
    describeName: 'resolveErasActive',
    method: 'countErasByCoach',
    resolve: (service) => service.resolveErasActive(),
    rows: [{ coachId: 1, name: 'Roze Madder', count: 3 }],
    expectedTitle: 'Coaches by eras active',
  },
];

describe.each(cases)(
  'CoachToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle }) => {
    // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
    // rendering) is covered by leaderboard.service.spec.ts. Here `leaderboard`
    // is a mock returning a canned reply, so this test only asserts what
    // CoachToplistService itself owns: the embed title it configures, and the
    // per-row deepdive button id its own buildCustomId closure produces.
    it('wires the embed title and per-row deepdive button id', async () => {
      const coaches = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as CoachesService;
      const { service, leaderboard } = await makeService(coaches);
      const canned = {
        embeds: [{ title: 'canned', description: 'canned' }],
      };
      leaderboard.resolveToplist.mockResolvedValueOnce(canned);
      const result = await resolve(service);
      expect(result).toBe(canned);
      const options = leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<CoachRow>;
      expect(options.title).toBe(expectedTitle);
      expect(options.buildCustomId?.(rows[0])).toBe(
        `${COACH_BUTTON_CUSTOM_ID_PREFIX}${rows[0].coachId}`,
      );
    });

    it('binds fetchRows to a call passing the fetch limit', async () => {
      const queryFn = vi.fn().mockResolvedValue(rows);
      const coaches = { [method]: queryFn } as unknown as CoachesService;
      const { service, leaderboard } = await makeService(coaches);
      leaderboard.resolveToplist.mockImplementation(async (options) => {
        await options.fetchRows(TOPLIST_FETCH_LIMIT);
        return 'canned';
      });
      await resolve(service);
      expect(queryFn.mock.calls[0]?.at(-1)).toBe(TOPLIST_FETCH_LIMIT);
    });

    // The real timeout race lives in DatabaseTimeoutService/LeaderboardService
    // (covered by their own specs); here `leaderboard` is a mock, so this
    // confirms CoachToplistService configures the right timeout message and
    // that whatever leaderboard.resolveToplist resolves to is returned as-is.
    it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
      const coaches = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as CoachesService;
      const { service, leaderboard } = await makeService(coaches);
      leaderboard.resolveToplist.mockResolvedValueOnce(
        COACH_TOPLIST_TIMEOUT_MESSAGE,
      );
      const result = await resolve(service);
      expect(result).toBe(COACH_TOPLIST_TIMEOUT_MESSAGE);
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
        }),
      );
    });
  },
);

describe('CoachToplistService.resolveCompetitionsPlayed', () => {
  it('passes the era id through to the query', async () => {
    const countCompetitionsByCoach = vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]);
    const coaches = {
      countCompetitionsByCoach,
    } as unknown as CoachesService;
    const { service, leaderboard } = await makeService(coaches);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveCompetitionsPlayed({ eraId: 20 });
    expect(countCompetitionsByCoach).toHaveBeenCalledWith(
      { eraId: 20 },
      TOPLIST_FETCH_LIMIT,
    );
  });
});

describe('CoachToplistService.resolveErasActive', () => {
  it('passes the fetch limit through to the query', async () => {
    const countErasByCoach = vi.fn().mockResolvedValue([]);
    const coaches = { countErasByCoach } as unknown as CoachesService;
    const { service, leaderboard } = await makeService(coaches);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveErasActive();
    expect(countErasByCoach).toHaveBeenCalledWith(TOPLIST_FETCH_LIMIT);
  });
});

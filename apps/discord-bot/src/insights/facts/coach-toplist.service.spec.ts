import {
  CoachesService,
  FACT_SCOPE_ALL_TIME,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';

import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { COACH_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { CoachToplistService } from './coach-toplist.service';
import { makeLeaderboardMock } from './toplist.test-helpers';

interface MadeService {
  service: CoachToplistService;
  leaderboard: MockProxy<LeaderboardService>;
}

async function makeService(coaches: CoachesService): Promise<MadeService> {
  const leaderboard = makeLeaderboardMock();
  const moduleRef = await Test.createTestingModule({
    providers: [
      CoachToplistService,
      { provide: CoachesService, useValue: coaches },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(CoachToplistService), leaderboard };
}

interface ToplistCase {
  describeName: string;
  method: keyof CoachesService;
  resolve: (service: CoachToplistService) => Promise<unknown>;
  rows: { coachId: number; name: string; count: number }[];
  expectedTitle: string;
  expectedDescription: string;
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
    expectedDescription:
      '1. Roze Madder — 9\n1. Grashnak — 9\n2. Skabsquik — 4',
  },
  {
    describeName: 'resolveTeams',
    method: 'countTeamsByCoach',
    resolve: (service) => service.resolveTeams(FACT_SCOPE_ALL_TIME),
    rows: [{ coachId: 1, name: 'Roze Madder', count: 3 }],
    expectedTitle: 'Coaches by teams coached',
    expectedDescription: '1. Roze Madder — 3',
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
    expectedDescription: '1. Roze Madder — 5\n2. Grashnak — 2',
  },
  {
    describeName: 'resolveErasActive',
    method: 'countErasByCoach',
    resolve: (service) => service.resolveErasActive(),
    rows: [{ coachId: 1, name: 'Roze Madder', count: 3 }],
    expectedTitle: 'Coaches by eras active',
    expectedDescription: '1. Roze Madder — 3',
  },
];

describe.each(cases)(
  'CoachToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle, expectedDescription }) => {
    it('returns a leaderboard embed with one deepdive button per coach row', async () => {
      const coaches = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as CoachesService;
      const { service } = await makeService(coaches);
      const result = (await resolve(service)) as {
        embeds: { title: string; description: string }[];
        components: { components: { label: string; custom_id: string }[] }[];
      };
      expect(result.embeds).toEqual([
        { title: expectedTitle, description: expectedDescription },
      ]);
      const buttons = result.components.flatMap((row) => row.components);
      expect(buttons.map((b) => b.custom_id)).toEqual(
        rows.map((r) => `${COACH_BUTTON_CUSTOM_ID_PREFIX}${r.coachId}`),
      );
      expect(buttons.map((b) => b.label)).toEqual(rows.map((r) => r.name));
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
      // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
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
    const { service } = await makeService(coaches);
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
    const { service } = await makeService(coaches);
    await service.resolveErasActive();
    expect(countErasByCoach).toHaveBeenCalledWith(TOPLIST_FETCH_LIMIT);
  });
});

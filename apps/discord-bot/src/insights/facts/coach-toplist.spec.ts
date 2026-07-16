import type { CoachesService } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveCoachCompetitionsPlayedToplist,
  resolveCoachErasActiveToplist,
  resolveCoachMatchesPlayedToplist,
  resolveCoachTeamsToplist,
} from './coach-toplist';
import {
  expectLeaderboardEmbed,
  expectStunnedOnTimeout,
} from './toplist.test-helpers';

interface ToplistCase {
  describeName: string;
  method: keyof CoachesService;
  resolve: (coaches: CoachesService) => Promise<unknown>;
  rows: { coachId: number; name: string; count: number }[];
  expectedTitle: string;
  expectedDescription: string;
}

const cases: ToplistCase[] = [
  {
    describeName: 'resolveCoachMatchesPlayedToplist',
    method: 'countMatchesPlayedByCoach',
    resolve: (coaches) => resolveCoachMatchesPlayedToplist(coaches),
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
    describeName: 'resolveCoachTeamsToplist',
    method: 'countTeamsByCoach',
    resolve: (coaches) => resolveCoachTeamsToplist(coaches),
    rows: [{ coachId: 1, name: 'Roze Madder', count: 3 }],
    expectedTitle: 'Coaches by teams coached',
    expectedDescription: '1. Roze Madder — 3',
  },
  {
    describeName: 'resolveCoachCompetitionsPlayedToplist',
    method: 'countCompetitionsByCoach',
    resolve: (coaches) => resolveCoachCompetitionsPlayedToplist(coaches),
    rows: [
      { coachId: 1, name: 'Roze Madder', count: 5 },
      { coachId: 2, name: 'Grashnak', count: 2 },
    ],
    expectedTitle: 'Coaches by competitions played',
    expectedDescription: '1. Roze Madder — 5\n2. Grashnak — 2',
  },
  {
    describeName: 'resolveCoachErasActiveToplist',
    method: 'countErasByCoach',
    resolve: (coaches) => resolveCoachErasActiveToplist(coaches),
    rows: [{ coachId: 1, name: 'Roze Madder', count: 3 }],
    expectedTitle: 'Coaches by eras active',
    expectedDescription: '1. Roze Madder — 3',
  },
];

describe.each(cases)(
  '$describeName',
  ({ method, resolve, rows, expectedTitle, expectedDescription }) => {
    it('returns a leaderboard embed built from the query rows', async () => {
      const coaches = {
        [method]: vi.fn().mockResolvedValue(rows),
      } as unknown as CoachesService;
      const result = await resolve(coaches);
      expectLeaderboardEmbed(result, expectedTitle, expectedDescription);
    });

    it('falls back to "I am stunned" when the query does not respond in time', async () => {
      await expectStunnedOnTimeout(
        (coaches: CoachesService) => resolve(coaches),
        () =>
          ({
            [method]: vi.fn().mockReturnValue(new Promise(() => {})),
          }) as unknown as CoachesService,
      );
    });
  },
);

describe('resolveCoachCompetitionsPlayedToplist', () => {
  it('passes the era id through to the query', async () => {
    const countCompetitionsByCoach = vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]);
    const coaches = {
      countCompetitionsByCoach,
    } as unknown as CoachesService;
    await resolveCoachCompetitionsPlayedToplist(coaches, 20);
    expect(countCompetitionsByCoach).toHaveBeenCalledWith(20);
  });
});

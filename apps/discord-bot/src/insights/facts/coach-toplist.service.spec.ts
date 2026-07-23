import type { CoachesService } from '@blood-bowl-tracker/game-data';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { COACH_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import { LeaderboardService } from '../leaderboard.service';
import { CoachToplistService } from './coach-toplist.service';
import { expectTimeoutFallback } from './toplist.test-helpers';

function makeService(coaches: CoachesService): CoachToplistService {
  return new CoachToplistService(
    coaches,
    new LeaderboardService(new DatabaseTimeoutService()),
  );
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
      const result = (await resolve(makeService(coaches))) as {
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

    it('falls back to the timeout message when the query does not respond in time', async () => {
      await expectTimeoutFallback(
        (coaches: CoachesService) => resolve(makeService(coaches)),
        () =>
          ({
            [method]: vi.fn().mockReturnValue(new Promise(() => {})),
          }) as unknown as CoachesService,
        COACH_TOPLIST_TIMEOUT_MESSAGE,
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
    const service = makeService(coaches);
    await service.resolveCompetitionsPlayed({ eraId: 20 });
    expect(countCompetitionsByCoach).toHaveBeenCalledWith({ eraId: 20 });
  });
});

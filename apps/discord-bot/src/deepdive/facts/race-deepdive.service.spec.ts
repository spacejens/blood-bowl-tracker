import { RacesService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import {
  DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_NO_TEAMS_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { RaceDeepdiveService } from './race-deepdive.service';

async function makeService(
  races: RacesService,
  databaseTimeout: MockProxy<DatabaseTimeoutService> = mockDatabaseTimeout(),
  leaderboard: MockProxy<LeaderboardService> = mock<LeaderboardService>(),
): Promise<{
  service: RaceDeepdiveService;
  leaderboard: MockProxy<LeaderboardService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaceDeepdiveService,
      { provide: RacesService, useValue: races },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(RaceDeepdiveService), leaderboard };
}

function makeRaces(options: {
  race?: { id: number; name: string };
  eras?: { id: number; name: string }[];
  topTeams?: { id: number; name: string; count: number }[];
}): RacesService {
  return {
    findById: vi.fn().mockResolvedValue(options.race),
    listEras: vi.fn().mockResolvedValue(options.eras ?? []),
    getTopTeamsByMatchesPlayed: vi
      .fn()
      .mockResolvedValue(options.topTeams ?? []),
  } as unknown as RacesService;
}

/** A `LeaderboardService` mock canned to echo its ranking/button inputs back
 * unchanged (rows through as-is with a placeholder rank, no truncation; button
 * entries through as one action row). LeaderboardService's own ranking/button
 * logic is covered by leaderboard.service.spec.ts; this stand-in exists only
 * so RaceDeepdiveService's own description/button-composition logic can be
 * exercised without crashing on an unconfigured mock. */
function passthroughLeaderboard(): MockProxy<LeaderboardService> {
  const leaderboard = mock<LeaderboardService>();
  leaderboard.topRanksWithTies.mockImplementation((rows) => ({
    rows: rows.map((row) => ({ ...row, rank: 1 })),
    truncatedCount: 0,
    tieGroupOpenEnded: false,
  }));
  leaderboard.buildEntityButtons.mockImplementation(
    (rows, buildCustomId, label) =>
      rows.length === 0
        ? []
        : [
            {
              type: 1,
              components: rows.map((row) => ({
                type: 2,
                style: 1,
                label: label(row),
                custom_id: buildCustomId(row),
              })),
            },
          ],
  );
  return leaderboard;
}

describe('RaceDeepdiveService', () => {
  it('returns the not-found message when the race does not exist', async () => {
    const { service } = await makeService(makeRaces({ race: undefined }));
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
  });

  // LeaderboardService.topRanksWithTies/buildEntityButtons themselves
  // (ranking, tie handling, dedupe/cap/chunk) are covered by
  // leaderboard.service.spec.ts. `passthroughLeaderboard()` cans them to
  // simply echo their inputs, so this test asserts only what
  // RaceDeepdiveService itself owns: joining the eras/career lines, and
  // building the era-then-team button-entry pool (in that order) that it
  // hands to buildEntityButtons.
  it('renders the eras list and top-teams list, with era buttons before team buttons', async () => {
    const leaderboard = passthroughLeaderboard();
    const { service } = await makeService(
      makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [
          { id: 3, name: 'BB2016' },
          { id: 4, name: 'BB2020' },
        ],
        topTeams: [
          { id: 9, name: 'Gouged Eye', count: 40 },
          { id: 10, name: 'Da Deff Skwad', count: 12 },
        ],
      }),
      undefined,
      leaderboard,
    );
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Orc',
          description: [
            'Eras: BB2016, BB2020',
            '',
            'Top teams by matches played:',
            '1. Gouged Eye — 40',
            '1. Da Deff Skwad — 12',
          ].join('\n'),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: 'BB2016', custom_id: 'deepdive:era:3' },
            { type: 2, style: 1, label: 'BB2020', custom_id: 'deepdive:era:4' },
            {
              type: 2,
              style: 1,
              label: 'Gouged Eye',
              custom_id: 'deepdive:team:9',
            },
            {
              type: 2,
              style: 1,
              label: 'Da Deff Skwad',
              custom_id: 'deepdive:team:10',
            },
          ],
        },
      ],
    });
  });

  it('shows "None recorded" when the race is linked to no eras', async () => {
    const { service } = await makeService(
      makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [],
        topTeams: [{ id: 9, name: 'Gouged Eye', count: 40 }],
      }),
      undefined,
      passthroughLeaderboard(),
    );
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')[0]).toBe(
      'Eras: None recorded',
    );
  });

  it('shows the no-teams placeholder when the race has no top teams', async () => {
    const { service } = await makeService(
      makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [{ id: 4, name: 'BB2020' }],
        topTeams: [],
      }),
      undefined,
      passthroughLeaderboard(),
    );
    const result = await service.resolve(1);
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
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: 'BB2020', custom_id: 'deepdive:era:4' },
          ],
        },
      ],
    });
  });

  it('appends a truncation note when the ranked rows report a truncated count', async () => {
    const leaderboard = mock<LeaderboardService>();
    const rankedTeams = [{ id: 1, name: 'A', count: 9, rank: 1 }];
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: rankedTeams,
      truncatedCount: 4,
      tieGroupOpenEnded: false,
    });
    leaderboard.buildEntityButtons.mockReturnValue([]);
    const { service } = await makeService(
      makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [{ id: 4, name: 'BB2020' }],
        topTeams: [{ id: 1, name: 'A', count: 9 }],
      }),
      undefined,
      leaderboard,
    );
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 4 more tied.');
  });

  it('omits components when the race has no eras and no teams', async () => {
    const { service } = await makeService(
      makeRaces({ race: { id: 7, name: 'Orc' }, eras: [], topTeams: [] }),
      undefined,
      passthroughLeaderboard(),
    );
    const result = await service.resolve(7);
    expect(result).not.toHaveProperty('components');
  });

  it('falls back to the race timeout message when the race lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService(makeRaces({}), databaseTimeout);
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_RACE_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the eras timeout message when the era-names lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run.mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService(
          makeRaces({ race: { id: 1, name: 'Orc' } }),
          databaseTimeout,
        );
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the teams timeout message when the top-teams lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService(
          makeRaces({
            race: { id: 1, name: 'Orc' },
            eras: [{ id: 4, name: 'BB2020' }],
          }),
          databaseTimeout,
        );
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE,
    );
  });
});

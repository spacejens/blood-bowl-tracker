import { TeamsService } from '@blood-bowl-tracker/game-data';
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
  DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { TeamDeepdiveService } from './team-deepdive.service';

async function makeService(
  teams: TeamsService,
  databaseTimeout: MockProxy<DatabaseTimeoutService> = mockDatabaseTimeout(),
  leaderboard: MockProxy<LeaderboardService> = mock<LeaderboardService>(),
): Promise<{
  service: TeamDeepdiveService;
  leaderboard: MockProxy<LeaderboardService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TeamDeepdiveService,
      { provide: TeamsService, useValue: teams },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(TeamDeepdiveService), leaderboard };
}

/** A `LeaderboardService` mock canned to echo its ranking/button inputs back
 * unchanged (rows through as-is with a placeholder rank, no truncation; button
 * entries through as one action row). LeaderboardService's own ranking/button
 * logic is covered by leaderboard.service.spec.ts; this stand-in exists only
 * so TeamDeepdiveService's own description/button-composition logic can be
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

function makeTeams(options: {
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
}): TeamsService {
  return {
    findById: vi.fn().mockResolvedValue(options.team),
    getCareerSpan: vi.fn().mockResolvedValue(options.span),
    getTopPlayersByMatchEventCount: vi
      .fn()
      .mockResolvedValue(options.topPlayers ?? []),
  } as unknown as TeamsService;
}

const grinders = {
  id: 1,
  name: '40 grinders',
  raceName: 'Dwarf',
  raceId: 4,
  coachName: 'Roze Madder',
  coachId: 12,
};

describe('TeamDeepdiveService', () => {
  it('returns the not-found message when the team does not exist', async () => {
    const { service } = await makeService(makeTeams({ team: undefined }));
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
  });

  // LeaderboardService.topRanksWithTies/buildEntityButtons themselves
  // (ranking, tie handling, dedupe/cap/chunk) are covered by
  // leaderboard.service.spec.ts. `passthroughLeaderboard()` cans them to
  // simply echo their inputs, so this test asserts only what
  // TeamDeepdiveService itself owns: joining the race/coach/career/ranked-row
  // lines, and building the race-then-coach-then-player button-entry pool (in
  // that order) that it hands to buildEntityButtons.
  it('renders the race, coach, career span and top-players list, with header buttons before player buttons', async () => {
    const { service } = await makeService(
      makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [
          { playerId: 5, name: 'Griff', count: 20 },
          { playerId: 8, name: 'Morg', count: 11 },
        ],
      }),
      undefined,
      passthroughLeaderboard(),
    );
    const result = await service.resolve(1);
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
            '1. Morg — 11',
          ].join('\n'),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 1, label: 'Dwarf', custom_id: 'deepdive:race:4' },
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

  it('appends a truncation note when the ranked rows report a truncated count', async () => {
    const leaderboard = mock<LeaderboardService>();
    const rankedPlayers = [{ playerId: 1, name: 'P0', count: 9, rank: 1 }];
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: rankedPlayers,
      truncatedCount: 2,
      tieGroupOpenEnded: false,
    });
    leaderboard.buildEntityButtons.mockReturnValue([]);
    const { service } = await makeService(
      makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [{ playerId: 1, name: 'P0', count: 9 }],
      }),
      undefined,
      leaderboard,
    );
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 2 more tied.');
  });

  it('shows race, coach and the no-matches message, skipping the top-players section, but still renders race/coach buttons', async () => {
    const teams = makeTeams({ team: grinders, span: undefined });
    const { service } = await makeService(
      teams,
      undefined,
      passthroughLeaderboard(),
    );
    const result = await service.resolve(1);
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
            { type: 2, style: 1, label: 'Dwarf', custom_id: 'deepdive:race:4' },
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
    expect(teams.getTopPlayersByMatchEventCount).not.toHaveBeenCalled();
  });

  it('falls back to the team timeout message when the team lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService(makeTeams({}), databaseTimeout);
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the career timeout message when the span lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run.mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService(
          makeTeams({ team: grinders }),
          databaseTimeout,
        );
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the players timeout message when the top-players lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService(
          makeTeams({
            team: grinders,
            span: { start: '2021-09-01', end: '2023-06-10' },
          }),
          databaseTimeout,
        );
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
    );
  });

  it('still renders race and coach buttons when the team has no matches', async () => {
    const { service } = await makeService(
      makeTeams({
        team: {
          id: 1,
          name: 'Reikland Reavers',
          raceName: 'Human',
          raceId: 2,
          coachName: 'Roze',
          coachId: 9,
        },
        span: undefined,
      }),
      undefined,
      passthroughLeaderboard(),
    );
    const result = (await service.resolve(1)) as unknown as {
      components: { components: { label: string; custom_id: string }[] }[];
    };
    const buttons = result.components.flatMap((row) => row.components);
    expect(buttons.map((b) => b.custom_id)).toEqual([
      'deepdive:race:2',
      'deepdive:coach:9',
    ]);
  });
});

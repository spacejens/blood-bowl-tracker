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
import { EntityComponentsService } from '../../entity-components.service';
import { passthroughEntityComponents } from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { passthroughLeaderboard } from '../../insights/leaderboard-mock.test-helpers';
import { TeamDeepdiveService } from './team-deepdive.service';

interface MakeServiceOptions {
  teams: TeamsService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  leaderboard?: MockProxy<LeaderboardService>;
  entityComponents?: MockProxy<EntityComponentsService>;
}

async function makeService({
  teams,
  databaseTimeout = mockDatabaseTimeout(),
  leaderboard = mock<LeaderboardService>(),
  entityComponents = passthroughEntityComponents(),
}: MakeServiceOptions): Promise<{
  service: TeamDeepdiveService;
  leaderboard: MockProxy<LeaderboardService>;
  entityComponents: MockProxy<EntityComponentsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TeamDeepdiveService,
      { provide: TeamsService, useValue: teams },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return {
    service: moduleRef.get(TeamDeepdiveService),
    leaderboard,
    entityComponents,
  };
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
    const { service } = await makeService({
      teams: makeTeams({ team: undefined }),
    });
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
  });

  // LeaderboardService.topRanksWithTies (ranking, tie handling) is covered by
  // leaderboard.service.spec.ts. `passthroughLeaderboard()` cans it to simply
  // echo its inputs, and `passthroughEntityComponents()` cans component
  // building the same way, so this test asserts only what TeamDeepdiveService
  // itself owns: joining the race/coach/career/ranked-row lines, and building
  // the race-then-coach-then-player component-entry pool (in that order) that
  // it hands to buildEntityComponents.
  it('renders the race, coach, career span and top-players list, with header components before player components', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [
          { playerId: 5, name: 'Griff', count: 20 },
          { playerId: 8, name: 'Morg', count: 11 },
        ],
      }),
      leaderboard: passthroughLeaderboard(),
    });
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
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [{ playerId: 1, name: 'P0', count: 9 }],
      }),
      leaderboard,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 2 more tied.');
  });

  it('appends the overflow note when components report entries without a link', async () => {
    const leaderboard = passthroughLeaderboard();
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 5 more without a link.',
    });
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [{ playerId: 1, name: 'P0', count: 9 }],
      }),
      leaderboard,
      entityComponents,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 5 more without a link.');
  });

  it('shows race, coach and the no-matches message, skipping the top-players section, but still renders race/coach components', async () => {
    const teams = makeTeams({ team: grinders, span: undefined });
    const { service } = await makeService({
      teams,
      leaderboard: passthroughLeaderboard(),
    });
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
        const { service } = await makeService({
          teams: makeTeams({}),
          databaseTimeout,
        });
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
        const { service } = await makeService({
          teams: makeTeams({ team: grinders }),
          databaseTimeout,
        });
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
        const { service } = await makeService({
          teams: makeTeams({
            team: grinders,
            span: { start: '2021-09-01', end: '2023-06-10' },
          }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
    );
  });

  it('still renders race and coach components when the team has no matches', async () => {
    const { service } = await makeService({
      teams: makeTeams({
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
      leaderboard: passthroughLeaderboard(),
    });
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

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
  DEEPDIVE_TEAM_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { passthroughLeaderboard } from '../../insights/leaderboard-mock.test-helpers';
import { PlayerContextService } from '../../insights/player-context.service';
import { passthroughPlayerContext } from '../../insights/player-context-mock.test-helpers';
import { TeamDeepdiveService } from './team-deepdive.service';

interface MakeServiceOptions {
  teams: TeamsService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  leaderboard?: MockProxy<LeaderboardService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  playerContext?: MockProxy<PlayerContextService>;
}

async function makeService({
  teams,
  databaseTimeout = mockDatabaseTimeout(),
  leaderboard = mock<LeaderboardService>(),
  entityComponents = passthroughEntityComponents(),
  playerContext = passthroughPlayerContext(),
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
      { provide: PlayerContextService, useValue: playerContext },
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
  eras?: { id: number; name: string }[];
  span?: { start: string; end: string };
  topPlayers?: { playerId: number; name: string; count: number }[];
}): TeamsService {
  return {
    findById: vi.fn().mockResolvedValue(options.team),
    listEras: vi.fn().mockResolvedValue(options.eras ?? []),
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
  // itself owns: joining the race/coach/eras/career/ranked-row lines, and
  // building the player-then-race-then-coach-then-era component-entry pool
  // (in that order — leaderboard entries take component priority over header
  // entries) that it hands to buildEntityComponents.
  it('renders the race, coach, career span and top-players list, with player components before header components', async () => {
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
            'Eras: None recorded',
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
  });

  it('renders the eras line after the coach line, with era buttons after the player buttons', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        eras: [
          { id: 3, name: 'BB2016' },
          { id: 4, name: 'BB2020' },
        ],
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [{ playerId: 5, name: 'Griff', count: 20 }],
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
            'Eras: BB2016, BB2020',
            'Career: 2021-09-01 – 2023-06-10',
            '',
            'Top players by match events:',
            '1. Griff — 20',
          ].join('\n'),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Griff',
              custom_id: 'deepdive:player:5',
            },
            { type: 2, style: 1, label: 'Dwarf', custom_id: 'deepdive:race:4' },
            {
              type: 2,
              style: 1,
              label: 'Roze Madder',
              custom_id: 'deepdive:coach:12',
            },
            { type: 2, style: 1, label: 'BB2016', custom_id: 'deepdive:era:3' },
            { type: 2, style: 1, label: 'BB2020', custom_id: 'deepdive:era:4' },
          ],
        },
      ],
    });
  });

  it('shows "None recorded" when the team is linked to no eras', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        eras: [],
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [{ playerId: 5, name: 'Griff', count: 20 }],
      }),
      leaderboard: passthroughLeaderboard(),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')[2]).toBe(
      'Eras: None recorded',
    );
  });

  it('renders the eras line and era buttons on the no-matches path too', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        eras: [{ id: 4, name: 'BB2020' }],
        span: undefined,
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
            'Eras: BB2020',
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
            { type: 2, style: 1, label: 'BB2020', custom_id: 'deepdive:era:4' },
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
            'Eras: None recorded',
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

  // The no-matches early return builds its own components (header-only, since
  // no leaderboard data has been fetched yet) and threads the overflow note
  // into the description. The shared entity-components stubs hardcode
  // `overflowNote: null`, so this branch needs a per-test override to be
  // exercised with a note present.
  it('appends the overflow note on the no-matches path', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 4 more without a link.',
    });
    const { service } = await makeService({
      teams: makeTeams({ team: grinders, span: undefined }),
      entityComponents,
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: '40 grinders',
          description: [
            'Race: Dwarf',
            'Coach: Roze Madder',
            'Eras: None recorded',
            DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
            '…and 4 more without a link.',
          ].join('\n'),
        },
      ],
      components: [],
    });
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

  it('falls back to the eras timeout message when the era lookup times out', async () => {
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
      DEEPDIVE_TEAM_ERAS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the career timeout message when the span lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
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

  it('appends each player position and era to its line, leaving team, race and coach out', async () => {
    const playerContext = mock<PlayerContextService>();
    const decorated: {
      playerId: number;
      name: string;
      count: number;
      contextSuffix: string;
    }[] = [
      {
        playerId: 5,
        name: 'Griff',
        count: 20,
        contextSuffix: ' (Blitzer, First era)',
      },
      {
        playerId: 8,
        name: 'Morg',
        count: 11,
        contextSuffix: ' (Star Player, Second era)',
      },
    ];
    playerContext.attachSuffixes.mockResolvedValue(decorated);
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
      playerContext,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('1. Griff (Blitzer, First era) — 20');
    expect(lines).toContain('1. Morg (Star Player, Second era) — 11');
    const [rows, playerIdOf, options] =
      playerContext.attachSuffixes.mock.calls[0];
    expect(playerIdOf(rows[0])).toBe(5);
    expect(options).toEqual({
      includePosition: true,
      includeTeam: false,
      includeRace: false,
      includeEra: true,
      includeCoach: false,
    });
  });

  it('falls back to the player-context timeout message when attachSuffixes times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          teams: makeTeams({
            team: grinders,
            span: { start: '2021-09-01', end: '2023-06-10' },
            topPlayers: [{ playerId: 5, name: 'Griff', count: 20 }],
          }),
          leaderboard: passthroughLeaderboard(),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
    );
  });
});

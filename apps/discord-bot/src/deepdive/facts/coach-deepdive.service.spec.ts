import { CoachesService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { EntityComponentsService } from '../../entity-components.service';
import { nullEntityComponents } from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_NO_MATCHES_MESSAGE,
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../button-custom-ids';
import { CoachDeepdiveService } from './coach-deepdive.service';

interface MakeServiceOptions {
  coaches: CoachesService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  leaderboard?: MockProxy<LeaderboardService>;
  entityComponents?: MockProxy<EntityComponentsService>;
}

async function makeService({
  coaches,
  databaseTimeout = mockDatabaseTimeout(),
  leaderboard = mock<LeaderboardService>(),
  entityComponents = nullEntityComponents(),
}: MakeServiceOptions): Promise<{
  service: CoachDeepdiveService;
  leaderboard: MockProxy<LeaderboardService>;
  entityComponents: MockProxy<EntityComponentsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CoachDeepdiveService,
      { provide: CoachesService, useValue: coaches },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return {
    service: moduleRef.get(CoachDeepdiveService),
    leaderboard,
    entityComponents,
  };
}

function makeCoaches(options: {
  coach?: { id: number; name: string };
  span?: { start: string; end: string };
  topTeams?: { id: number; name: string; count: number }[];
}): CoachesService {
  return {
    findById: vi.fn().mockResolvedValue(options.coach),
    getCareerSpan: vi.fn().mockResolvedValue(options.span),
    getTopTeamsByMatchesPlayed: vi
      .fn()
      .mockResolvedValue(options.topTeams ?? []),
  } as unknown as CoachesService;
}

describe('CoachDeepdiveService', () => {
  it('returns the not-found message when the coach does not exist', async () => {
    const { service } = await makeService({
      coaches: makeCoaches({ coach: undefined }),
    });
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
  });

  // LeaderboardService.topRanksWithTies (ranking, tie handling) is covered by
  // leaderboard.service.spec.ts. Here `leaderboard` is a mock returning
  // canned rank output, so this test asserts only what CoachDeepdiveService
  // itself owns: joining the career-span and ranked-row lines into the embed
  // description.
  it('renders the career span and top-teams list from the ranked rows', async () => {
    const leaderboard = mock<LeaderboardService>();
    const rankedTeams = [
      { id: 11, name: 'Reikland Reavers', count: 12, rank: 1 },
      { id: 22, name: 'Gouged Eye', count: 5, rank: 2 },
    ];
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: rankedTeams,
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
    const cannedComponents = [
      {
        type: ComponentType.ActionRow as const,
        components: [
          {
            type: ComponentType.Button as const,
            style: ButtonStyle.Primary as const,
            label: 'canned',
            custom_id: 'canned',
          },
        ],
      },
    ];
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: cannedComponents,
      overflowNote: null,
    });
    const rawTopTeams = [
      { id: 11, name: 'Reikland Reavers', count: 12 },
      { id: 22, name: 'Gouged Eye', count: 5 },
    ];
    const { service } = await makeService({
      coaches: makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: { start: '2021-09-01', end: '2023-06-10' },
        topTeams: rawTopTeams,
      }),
      leaderboard,
      entityComponents,
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Roze Madder',
          description: [
            'Career: 2021-09-01 – 2023-06-10',
            '',
            'Top teams by matches played:',
            '1. Reikland Reavers — 12',
            '2. Gouged Eye — 5',
          ].join('\n'),
        },
      ],
      components: cannedComponents,
    });
    // The 5 here is TOP_TEAMS_TOP_ENTRIES: CoachDeepdiveService's own choice
    // of where the top-teams tie boundary opens.
    expect(leaderboard.topRanksWithTies).toHaveBeenCalledWith(rawTopTeams, 5);
  });

  // EntityComponentsService's own dedupe/cap/chunk/select logic is covered
  // by entity-components.service.spec.ts. Here `entityComponents` is a mock
  // returning a canned component list, so this test asserts only what
  // CoachDeepdiveService itself owns: the per-team entry pool (id/label
  // pairs, one per ranked team) it hands to buildEntityComponents.
  it('builds one component entry per ranked team, keyed by team id', async () => {
    const leaderboard = mock<LeaderboardService>();
    const rankedTeams = [
      { id: 10, name: 'Gouged Eyes', count: 12, rank: 1 },
      { id: 11, name: 'Reikland Reavers', count: 5, rank: 2 },
    ];
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: rankedTeams,
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const { service } = await makeService({
      coaches: makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: { start: '2021-09-01', end: '2023-06-10' },
        topTeams: [
          { id: 10, name: 'Gouged Eyes', count: 12 },
          { id: 11, name: 'Reikland Reavers', count: 5 },
        ],
      }),
      leaderboard,
      entityComponents,
    });
    await service.resolve(1);
    const [entries] = entityComponents.buildEntityComponents.mock.calls[0];
    expect(entries).toEqual([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '10',
        label: 'Gouged Eyes',
      },
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '11',
        label: 'Reikland Reavers',
      },
    ]);
  });

  it('appends a truncation note when the ranked rows report a truncated count', async () => {
    const leaderboard = mock<LeaderboardService>();
    const rankedTeams = [{ id: 1, name: 'A', count: 9, rank: 1 }];
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: rankedTeams,
      truncatedCount: 3,
      tieGroupOpenEnded: false,
    });
    const { service } = await makeService({
      coaches: makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: { start: '2021-09-01', end: '2023-06-10' },
        topTeams: [{ id: 1, name: 'A', count: 9 }],
      }),
      leaderboard,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 3 more tied.');
  });

  it('appends the overflow note when components report entries without a link', async () => {
    const leaderboard = mock<LeaderboardService>();
    const rankedTeams = [{ id: 1, name: 'A', count: 9, rank: 1 }];
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: rankedTeams,
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 2 more without a link.',
    });
    const { service } = await makeService({
      coaches: makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: { start: '2021-09-01', end: '2023-06-10' },
        topTeams: [{ id: 1, name: 'A', count: 9 }],
      }),
      leaderboard,
      entityComponents,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 2 more without a link.');
  });

  it('omits components when the coach has no matches', async () => {
    const { service } = await makeService({
      coaches: makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: undefined,
      }),
    });
    const result = await service.resolve(1);
    expect(result).not.toHaveProperty('components');
  });

  it('omits components when the coach has a career span but no top teams', async () => {
    const leaderboard = mock<LeaderboardService>();
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: [],
      truncatedCount: 0,
      tieGroupOpenEnded: false,
    });
    const { service } = await makeService({
      coaches: makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: { start: '2021-09-01', end: '2023-06-10' },
        topTeams: [],
      }),
      leaderboard,
    });
    const result = await service.resolve(1);
    expect(result).not.toHaveProperty('components');
  });

  it('shows the no-matches message and skips the top-teams section', async () => {
    const coaches = makeCoaches({
      coach: { id: 1, name: 'Roze Madder' },
      span: undefined,
      topTeams: [],
    });
    const { service } = await makeService({ coaches });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Roze Madder',
          description: DEEPDIVE_COACH_NO_MATCHES_MESSAGE,
        },
      ],
    });
    // Top-teams lookup must not run for a coach with no matches.
    expect(coaches.getTopTeamsByMatchesPlayed).not.toHaveBeenCalled();
  });

  it('falls back to the coach timeout message when the coach lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          coaches: makeCoaches({}),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COACH_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the career timeout message when the span lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run.mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          coaches: makeCoaches({ coach: { id: 1, name: 'Roze Madder' } }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE,
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
        const { service } = await makeService({
          coaches: makeCoaches({
            coach: { id: 1, name: 'Roze Madder' },
            span: { start: '2021-09-01', end: '2023-06-10' },
          }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE,
    );
  });
});

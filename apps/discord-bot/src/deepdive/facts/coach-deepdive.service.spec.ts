import { CoachesService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_NO_MATCHES_MESSAGE,
  DEEPDIVE_COACH_NOT_FOUND_MESSAGE,
  DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COACH_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  expectTimeoutFallback,
  makeDeepdiveLeaderboardMock,
} from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { CoachDeepdiveService } from './coach-deepdive.service';

function makeDatabaseTimeout(): MockProxy<DatabaseTimeoutService> {
  const databaseTimeout = mock<DatabaseTimeoutService>();
  databaseTimeout.run.mockImplementation(async (work) => work);
  return databaseTimeout;
}

async function makeService(
  coaches: CoachesService,
  databaseTimeout: MockProxy<DatabaseTimeoutService> = makeDatabaseTimeout(),
): Promise<CoachDeepdiveService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CoachDeepdiveService,
      { provide: CoachesService, useValue: coaches },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: makeDeepdiveLeaderboardMock() },
    ],
  }).compile();
  return moduleRef.get(CoachDeepdiveService);
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
    const service = await makeService(makeCoaches({ coach: undefined }));
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_COACH_NOT_FOUND_MESSAGE);
  });

  it('renders the career span and top-teams list', async () => {
    const service = await makeService(
      makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: { start: '2021-09-01', end: '2023-06-10' },
        topTeams: [
          { id: 11, name: 'Reikland Reavers', count: 12 },
          { id: 22, name: 'Gouged Eye', count: 5 },
        ],
      }),
    );
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
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Reikland Reavers',
              custom_id: 'deepdive:team:11',
            },
            {
              type: 2,
              style: 1,
              label: 'Gouged Eye',
              custom_id: 'deepdive:team:22',
            },
          ],
        },
      ],
    });
  });

  it('renders a Primary button per listed team, keyed by team id', async () => {
    const service = await makeService(
      makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: { start: '2021-09-01', end: '2023-06-10' },
        topTeams: [
          { id: 11, name: 'Reikland Reavers', count: 12 },
          { id: 22, name: 'Gouged Eye', count: 5 },
        ],
      }),
    );
    const result = (await service.resolve(1)) as unknown as {
      components: { components: { label: string; custom_id: string }[] }[];
    };
    const buttons = result.components.flatMap((row) => row.components);
    expect(buttons).toEqual([
      {
        type: 2,
        style: 1,
        label: 'Reikland Reavers',
        custom_id: 'deepdive:team:11',
      },
      { type: 2, style: 1, label: 'Gouged Eye', custom_id: 'deepdive:team:22' },
    ]);
  });

  it('omits components when the coach has no matches', async () => {
    const service = await makeService(
      makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: undefined,
      }),
    );
    const result = await service.resolve(1);
    expect(result).not.toHaveProperty('components');
  });

  it('omits components when the coach has a career span but no top teams', async () => {
    const service = await makeService(
      makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: { start: '2021-09-01', end: '2023-06-10' },
        topTeams: [],
      }),
    );
    const result = await service.resolve(1);
    expect(result).not.toHaveProperty('components');
  });

  it('renders a tie group at the cutoff with a truncation note', async () => {
    const topTeams = [
      { id: 1, name: 'A', count: 9 },
      { id: 2, name: 'B', count: 9 },
      { id: 3, name: 'C', count: 9 },
      { id: 4, name: 'D', count: 9 },
      { id: 5, name: 'E', count: 9 },
      { id: 6, name: 'F', count: 9 },
      { id: 7, name: 'G', count: 9 },
      { id: 8, name: 'H', count: 9 },
      { id: 9, name: 'I', count: 9 },
      { id: 10, name: 'J', count: 9 },
    ];
    const service = await makeService(
      makeCoaches({
        coach: { id: 1, name: 'Roze Madder' },
        span: { start: '2021-09-01', end: '2023-06-10' },
        topTeams,
      }),
    );
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    // All ten fetched rows tie at rank 1; the resolver caps rendered entries at
    // MAX_LEADERBOARD_ENTRIES (10), so all ten show and no remainder is noted.
    expect(lines).toContain('1. A — 9');
    expect(lines).toContain('1. J — 9');
    expect(lines.every((l) => !l.startsWith('…and'))).toBe(true);
  });

  it('shows the no-matches message and skips the top-teams section', async () => {
    const coaches = makeCoaches({
      coach: { id: 1, name: 'Roze Madder' },
      span: undefined,
      topTeams: [],
    });
    const service = await makeService(coaches);
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
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(coaches.getTopTeamsByMatchesPlayed).not.toHaveBeenCalled();
  });

  it('falls back to the coach timeout message when the coach lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mock<DatabaseTimeoutService>();
        databaseTimeout.run.mockResolvedValueOnce(null);
        const service = await makeService(makeCoaches({}), databaseTimeout);
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COACH_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the career timeout message when the span lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mock<DatabaseTimeoutService>();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockResolvedValueOnce(null);
        const service = await makeService(
          makeCoaches({ coach: { id: 1, name: 'Roze Madder' } }),
          databaseTimeout,
        );
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the teams timeout message when the top-teams lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mock<DatabaseTimeoutService>();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
          .mockResolvedValueOnce(null);
        const service = await makeService(
          makeCoaches({
            coach: { id: 1, name: 'Roze Madder' },
            span: { start: '2021-09-01', end: '2023-06-10' },
          }),
          databaseTimeout,
        );
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE,
    );
  });
});

import { RacesService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_NO_TEAMS_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  expectTimeoutFallback,
  makeDeepdiveLeaderboardMock,
} from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { RaceDeepdiveService } from './race-deepdive.service';

function makeDatabaseTimeout(): MockProxy<DatabaseTimeoutService> {
  const databaseTimeout = mock<DatabaseTimeoutService>();
  databaseTimeout.run.mockImplementation(async (work) => work);
  return databaseTimeout;
}

async function makeService(
  races: RacesService,
  databaseTimeout: MockProxy<DatabaseTimeoutService> = makeDatabaseTimeout(),
): Promise<RaceDeepdiveService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaceDeepdiveService,
      { provide: RacesService, useValue: races },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: makeDeepdiveLeaderboardMock() },
    ],
  }).compile();
  return moduleRef.get(RaceDeepdiveService);
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

describe('RaceDeepdiveService', () => {
  it('returns the not-found message when the race does not exist', async () => {
    const service = await makeService(makeRaces({ race: undefined }));
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
  });

  it('renders the eras list and top-teams list', async () => {
    const service = await makeService(
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
            '2. Da Deff Skwad — 12',
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
    const service = await makeService(
      makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [],
        topTeams: [{ id: 9, name: 'Gouged Eye', count: 40 }],
      }),
    );
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')[0]).toBe(
      'Eras: None recorded',
    );
  });

  it('shows the no-teams placeholder when the race has no top teams', async () => {
    const service = await makeService(
      makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [{ id: 4, name: 'BB2020' }],
        topTeams: [],
      }),
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

  it('renders a tie group at the cutoff without a truncation note when ten tie', async () => {
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
      makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [{ id: 4, name: 'BB2020' }],
        topTeams,
      }),
    );
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('1. A — 9');
    expect(lines).toContain('1. J — 9');
    expect(lines.every((l) => !l.startsWith('…and'))).toBe(true);
  });

  it('builds era buttons then team buttons in one combined pool', async () => {
    const service = await makeService(
      makeRaces({
        race: { id: 7, name: 'Orc' },
        eras: [
          { id: 3, name: 'BB2016' },
          { id: 4, name: 'BB2020' },
        ],
        topTeams: [{ id: 9, name: 'Gouged Eye', count: 40 }],
      }),
    );
    const result = (await service.resolve(7)) as unknown as {
      components: { components: { label: string; custom_id: string }[] }[];
    };
    const buttons = result.components.flatMap((row) => row.components);
    expect(buttons.map((b) => b.custom_id)).toEqual([
      'deepdive:era:3',
      'deepdive:era:4',
      'deepdive:team:9',
    ]);
    expect(buttons.map((b) => b.label)).toEqual([
      'BB2016',
      'BB2020',
      'Gouged Eye',
    ]);
  });

  it('omits components when the race has no eras and no teams', async () => {
    const service = await makeService(
      makeRaces({ race: { id: 7, name: 'Orc' }, eras: [], topTeams: [] }),
    );
    const result = await service.resolve(7);
    expect(result).not.toHaveProperty('components');
  });

  it('falls back to the race timeout message when the race lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mock<DatabaseTimeoutService>();
        databaseTimeout.run.mockResolvedValueOnce(null);
        const service = await makeService(makeRaces({}), databaseTimeout);
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_RACE_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the eras timeout message when the era-names lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mock<DatabaseTimeoutService>();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockResolvedValueOnce(null);
        const service = await makeService(
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
        const databaseTimeout = mock<DatabaseTimeoutService>();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
          .mockResolvedValueOnce(null);
        const service = await makeService(
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

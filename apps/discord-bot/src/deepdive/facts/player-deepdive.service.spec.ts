import { PlayersService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  expectTimeoutFallback,
  makeDeepdiveLeaderboardMock,
} from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { PlayerDeepdiveService } from './player-deepdive.service';

const griff = {
  id: 1,
  name: 'Griff Oberwald',
  teamName: 'Reikland Reavers',
  teamId: 11,
  raceName: 'Human',
  raceId: 4,
  positionName: 'Blitzer',
};

function makeDatabaseTimeout(): MockProxy<DatabaseTimeoutService> {
  const databaseTimeout = mock<DatabaseTimeoutService>();
  databaseTimeout.run.mockImplementation(async (work) => work);
  return databaseTimeout;
}

async function makeService(
  players: PlayersService,
  databaseTimeout: MockProxy<DatabaseTimeoutService> = makeDatabaseTimeout(),
): Promise<PlayerDeepdiveService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerDeepdiveService,
      { provide: PlayersService, useValue: players },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: makeDeepdiveLeaderboardMock() },
    ],
  }).compile();
  return moduleRef.get(PlayerDeepdiveService);
}

function makePlayers(options: {
  player?: {
    id: number;
    name: string;
    teamName: string;
    teamId: number;
    raceName: string;
    raceId: number;
    positionName: string;
  };
  counts?: { label: string; count: number }[];
}): PlayersService {
  return {
    findById: vi.fn().mockResolvedValue(options.player),
    getDeepdiveCategoryCounts: vi.fn().mockResolvedValue(options.counts ?? []),
  } as unknown as PlayersService;
}

describe('PlayerDeepdiveService', () => {
  it('returns the not-found message when the player does not exist', async () => {
    const service = await makeService(makePlayers({ player: undefined }));
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
  });

  it('renders the header and only the non-zero categories', async () => {
    const service = await makeService(
      makePlayers({
        player: griff,
        counts: [
          { label: 'MVP awards', count: 2 },
          { label: 'Touchdowns scored', count: 5 },
          { label: 'Completions', count: 0 },
          { label: 'Interceptions', count: 0 },
          { label: 'Deflections', count: 0 },
          { label: 'Casualties inflicted', count: 3 },
          { label: 'Serious injuries inflicted', count: 0 },
          { label: 'Opponents killed', count: 0 },
          { label: 'Fouls committed', count: 1 },
        ],
      }),
    );
    const result = await service.resolve(1);
    expect(result).toMatchObject({
      embeds: [
        {
          title: 'Griff Oberwald',
          description: [
            'Team: Reikland Reavers',
            'Race: Human',
            'Position: Blitzer',
            '',
            'MVP awards: 2',
            'Touchdowns scored: 5',
            'Casualties inflicted: 3',
            'Fouls committed: 1',
          ].join('\n'),
        },
      ],
    });
  });

  it('shows the no-events placeholder when every category is zero', async () => {
    const service = await makeService(
      makePlayers({
        player: griff,
        counts: [
          { label: 'MVP awards', count: 0 },
          { label: 'Touchdowns scored', count: 0 },
        ],
      }),
    );
    const result = await service.resolve(1);
    expect(result).toMatchObject({
      embeds: [
        {
          title: 'Griff Oberwald',
          description: [
            'Team: Reikland Reavers',
            'Race: Human',
            'Position: Blitzer',
            '',
            DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
          ].join('\n'),
        },
      ],
    });
  });

  it('renders a team button and a race button from the header', async () => {
    const service = await makeService(
      makePlayers({
        player: {
          id: 1,
          name: 'Griff Oberwald',
          teamName: 'Reikland Reavers',
          teamId: 11,
          raceName: 'Human',
          raceId: 4,
          positionName: 'Blitzer',
        },
        counts: [{ label: 'Touchdowns', count: 3 }],
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
      { type: 2, style: 1, label: 'Human', custom_id: 'deepdive:race:4' },
    ]);
  });

  it('falls back to the player timeout message when the lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mock<DatabaseTimeoutService>();
        databaseTimeout.run.mockResolvedValueOnce(null);
        const service = await makeService(makePlayers({}), databaseTimeout);
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the counts timeout message when the counts lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mock<DatabaseTimeoutService>();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockResolvedValueOnce(null);
        const service = await makeService(
          makePlayers({ player: griff }),
          databaseTimeout,
        );
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
    );
  });
});

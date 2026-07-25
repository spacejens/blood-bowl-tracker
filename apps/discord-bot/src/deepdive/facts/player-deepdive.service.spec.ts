import { PlayersService } from '@blood-bowl-tracker/game-data';
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
import {
  DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import {
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
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

function defaultEntityComponents(): MockProxy<EntityComponentsService> {
  const entityComponents = mock<EntityComponentsService>();
  entityComponents.buildEntityComponents.mockReturnValue({
    components: [],
    overflowNote: null,
  });
  return entityComponents;
}

async function makeService(
  players: PlayersService,
  databaseTimeout: MockProxy<DatabaseTimeoutService> = mockDatabaseTimeout(),
  entityComponents: MockProxy<EntityComponentsService> = defaultEntityComponents(),
): Promise<{
  service: PlayerDeepdiveService;
  entityComponents: MockProxy<EntityComponentsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerDeepdiveService,
      { provide: PlayersService, useValue: players },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return { service: moduleRef.get(PlayerDeepdiveService), entityComponents };
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
    const { service } = await makeService(makePlayers({ player: undefined }));
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
  });

  it('renders the header and only the non-zero categories', async () => {
    const { service } = await makeService(
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
    const { service } = await makeService(
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

  // EntityComponentsService's own dedupe/cap/chunk/select logic is covered
  // by entity-components.service.spec.ts. Here `entityComponents` is a mock
  // returning a canned component list, so this test asserts only what
  // PlayerDeepdiveService itself owns: the team-then-race entry pool (in
  // that order, with the right ids/labels) it hands to buildEntityComponents.
  it('builds a team entry then a race entry from the header', async () => {
    const entityComponents = mock<EntityComponentsService>();
    const cannedComponents = [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: 'canned', custom_id: 'canned' },
        ],
      },
    ];
    entityComponents.buildEntityComponents.mockReturnValue({
      components: cannedComponents,
      overflowNote: null,
    });
    const { service } = await makeService(
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
      undefined,
      entityComponents,
    );
    const result = (await service.resolve(1)) as unknown as {
      components: unknown;
    };
    expect(result.components).toBe(cannedComponents);
    const [entries] = entityComponents.buildEntityComponents.mock.calls[0];
    expect(entries).toEqual([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '11',
        label: 'Reikland Reavers',
      },
      {
        customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '4',
        label: 'Human',
      },
    ]);
  });

  it('falls back to the player timeout message when the lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService(makePlayers({}), databaseTimeout);
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the counts timeout message when the counts lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run.mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService(
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

import type { StarPlayerHire } from '@blood-bowl-tracker/game-data';
import { StarPlayersService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { EntityComponentsService } from '../../entity-components.service';
import {
  entityComponentsMock,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
  stubEntityEmoji,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_STAR_PLAYER_HIRES_TIMEOUT_MESSAGE,
  DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_STAR_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { StarPlayerDeepdiveService } from './star-player-deepdive.service';

interface MakeServiceOptions {
  stars: StarPlayersService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
}

async function makeService({
  stars,
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = passthroughEntityComponents(),
}: MakeServiceOptions): Promise<{
  service: StarPlayerDeepdiveService;
  databaseTimeout: MockProxy<DatabaseTimeoutService>;
  entityComponents: MockProxy<EntityComponentsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerDeepdiveService,
      { provide: StarPlayersService, useValue: stars },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return {
    service: moduleRef.get(StarPlayerDeepdiveService),
    databaseTimeout,
    entityComponents,
  };
}

function makeStars(options: {
  star?: { positionId: number; name: string };
  hires?: StarPlayerHire[];
}): MockProxy<StarPlayersService> {
  const stars = mock<StarPlayersService>();
  stars.findById.mockResolvedValue(options.star);
  stars.listHiresByTeam.mockResolvedValue(options.hires ?? []);
  return stars;
}

const griff = { positionId: 20, name: 'Griff Oberwald' };

const hires: StarPlayerHire[] = [
  {
    teamId: 1,
    teamName: 'Reikland Reavers',
    raceName: 'Human',
    coachName: 'Rita',
    hireCount: 3,
  },
  {
    teamId: 2,
    teamName: 'Gouged Eye',
    raceName: 'Orc',
    coachName: 'Bob',
    hireCount: 1,
  },
];

describe('StarPlayerDeepdiveService', () => {
  it('returns the not-found message when the position is not a star', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: undefined }),
    });
    expect(await service.resolve(999)).toBe(
      DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
    );
  });

  it('returns the timeout message when the identity lookup times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    stubDatabaseTimeoutOnce(databaseTimeout);
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      databaseTimeout,
    });
    expect(await service.resolve(20)).toBe(
      DEEPDIVE_STAR_PLAYER_TIMEOUT_MESSAGE,
    );
  });

  it('returns the hires timeout message when the hire query times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (_work, fallback) => fallback);
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      databaseTimeout,
    });
    expect(await service.resolve(20)).toBe(
      DEEPDIVE_STAR_PLAYER_HIRES_TIMEOUT_MESSAGE,
    );
  });

  it('returns the not-found message when a star has no recorded hires', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires: [] }),
    });
    expect(await service.resolve(20)).toBe(
      DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE,
    );
  });

  it('renders one line per hiring team with a team button each', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
    });

    const result = await service.resolve(20);

    expect(result).toEqual({
      embeds: [
        {
          title: `${stubEntityEmoji(STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX)} Griff Oberwald`,
          description: [
            'Reikland Reavers (Human, coached by Rita) — 3 hires',
            'Gouged Eye (Orc, coached by Bob) — 1 hire',
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
              custom_id: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}1`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Gouged Eye',
              custom_id: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}2`,
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('keeps the game-data ordering rather than re-sorting', async () => {
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
    });

    const result = await service.resolve(20);

    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description.split('\n')[0]).toContain('Reikland Reavers');
  });

  it('appends the overflow note when not every team got a component', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more without a link.',
    });
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      entityComponents,
    });

    const result = await service.resolve(20);

    expect(
      (result as { embeds: { description: string }[] }).embeds[0].description,
    ).toBe(
      [
        'Reikland Reavers (Human, coached by Rita) — 3 hires',
        'Gouged Eye (Orc, coached by Bob) — 1 hire',
        '…and 3 more without a link.',
      ].join('\n'),
    );
  });

  it('omits the components key when nothing got a component', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const { service } = await makeService({
      stars: makeStars({ star: griff, hires }),
      entityComponents,
    });

    expect(await service.resolve(20)).not.toHaveProperty('components');
  });
});

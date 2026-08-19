import { StarPlayersService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { ComponentType } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { EntityComponentsService } from '../../entity-components.service';
import {
  entityComponentsMock,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
} from '../../entity-components-mock.test-helpers';
import {
  STAR_PLAYERS_LIST_NO_DATA_MESSAGE,
  STAR_PLAYERS_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { StarPlayersListService } from './star-players-list.service';
import { expectTimeoutFallback } from './toplist.test-helpers';

type StarRow = { positionId: number; name: string };

let databaseTimeout: MockProxy<DatabaseTimeoutService>;

// Tests that need the timeout branch call stubDatabaseTimeoutOnce per-case.
beforeEach(() => {
  databaseTimeout = mockDatabaseTimeout();
});

async function makeServiceFromStarPlayers(
  starPlayers: StarPlayersService,
  entityComponents: MockProxy<EntityComponentsService> = passthroughEntityComponents(),
): Promise<StarPlayersListService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayersListService,
      { provide: StarPlayersService, useValue: starPlayers },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return moduleRef.get(StarPlayersListService);
}

async function makeService(
  rows: StarRow[],
  entityComponents?: MockProxy<EntityComponentsService>,
): Promise<StarPlayersListService> {
  const starPlayers = mock<StarPlayersService>();

  starPlayers.listAll.mockResolvedValue(rows);
  return makeServiceFromStarPlayers(starPlayers, entityComponents);
}

describe('StarPlayersListService.resolve', () => {
  it('returns the empty-state embed when there are no star players', async () => {
    const result = await (await makeService([])).resolve();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Star Players',
          description: STAR_PLAYERS_LIST_NO_DATA_MESSAGE,
        },
      ],
    });
  });

  it('renders a single star with a deepdive button', async () => {
    const service = await makeService([
      { positionId: 20, name: 'Griff Oberwald' },
    ]);
    const result = await service.resolve();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Star Players',
          description: 'Griff Oberwald',
        },
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Griff Oberwald',
              custom_id: `${STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX}20`,
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('orders stars alphabetically by name regardless of query order', async () => {
    const service = await makeService([
      // deliberately scrambled input order
      { positionId: 3, name: 'Zara the Slayer' },
      { positionId: 1, name: 'Griff Oberwald' },
      { positionId: 2, name: 'Morg n Thorg' },
    ]);
    const result = await service.resolve();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Star Players',
          description: [
            'Griff Oberwald',
            'Morg n Thorg',
            'Zara the Slayer',
          ].join('\n'),
        },
      ],
      // passthroughEntityComponents() collapses everything into one action
      // row (real cap/chunk/select behavior is covered by
      // entity-components.service.spec.ts).
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Griff Oberwald',
              custom_id: `${STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX}1`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Morg n Thorg',
              custom_id: `${STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX}2`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Zara the Slayer',
              custom_id: `${STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX}3`,
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('falls back to the stunned message when the star player query times out', async () => {
    // The real timeout race is DatabaseTimeoutService's own responsibility
    // (covered by database-timeout.service.spec.ts); here databaseTimeout is a
    // mock, so this stubs its timeout branch directly rather than waiting on a
    // real timer.
    stubDatabaseTimeoutOnce(databaseTimeout);
    await expectTimeoutFallback(
      async (starPlayers: StarPlayersService) =>
        (await makeServiceFromStarPlayers(starPlayers)).resolve(),
      () => {
        const starPlayers = mock<StarPlayersService>();

        starPlayers.listAll.mockReturnValue(new Promise(() => {}));
        return starPlayers;
      },
      STAR_PLAYERS_LIST_TIMEOUT_MESSAGE,
    );
  });

  // The underlying cap/chunk/select logic is exercised in
  // entity-components.service.spec.ts. Here we only assert that
  // StarPlayersListService hands EntityComponentsService one entry per star,
  // in the same order used for the embed text.
  it('hands one entry per star to EntityComponentsService, in display order', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const service = await makeService(
      [
        { positionId: 2, name: 'Second Star' },
        { positionId: 1, name: 'First Star' },
      ],
      entityComponents,
    );
    await service.resolve();
    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'First Star',
      },
      {
        customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '2',
        label: 'Second Star',
      },
    ]);
  });

  it('appends the overflow note when some stars got no link', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more without a link.',
    });
    const service = await makeService(
      [{ positionId: 20, name: 'Griff Oberwald' }],
      entityComponents,
    );
    const result = (await service.resolve()) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toBe(
      'Griff Oberwald\n…and 3 more without a link.',
    );
  });

  it('truncates the description to the Discord embed cap when the star catalog is large', async () => {
    // starPlayers.list can never be narrowed by a league scope (see
    // fact-tree.ts's comment on the starPlayers.list leaf), so it is the
    // list fact most exposed to Discord's per-field description cap as the
    // star catalog grows. One name here is long enough that 200 of them
    // comfortably exceed the 4096-char MAX_DESCRIPTION_LENGTH.
    const rows: StarRow[] = Array.from({ length: 200 }, (_unused, index) => ({
      positionId: index,
      name: `Star Player Number ${index} With A Fairly Long Name`,
    }));
    const service = await makeService(rows);

    const result = (await service.resolve()) as {
      embeds: { description: string }[];
    };

    const description = result.embeds[0].description;
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });

  it('preserves the overflow note in full when the name list must be truncated to fit', async () => {
    // A hard end-of-string truncation would risk cutting the overflow note
    // itself off — exactly the case where it matters most, since it only
    // appears once the catalog is already long enough to need one.
    const entityComponents = entityComponentsMock();
    const overflowNote = '…and 12345 more without a link.';
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote,
    });
    const rows: StarRow[] = Array.from({ length: 200 }, (_unused, index) => ({
      positionId: index,
      name: `Star Player Number ${index} With A Fairly Long Name`,
    }));
    const service = await makeService(rows, entityComponents);

    const result = (await service.resolve()) as {
      embeds: { description: string }[];
    };

    const description = result.embeds[0].description;
    expect(description.endsWith(overflowNote)).toBe(true);
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
  });

  it('queries the full global catalog with no scope argument', async () => {
    const starPlayers = mock<StarPlayersService>();

    starPlayers.listAll.mockResolvedValue([]);
    const service = await makeServiceFromStarPlayers(starPlayers);
    await service.resolve();
    expect(starPlayers.listAll).toHaveBeenCalledWith();
  });
});

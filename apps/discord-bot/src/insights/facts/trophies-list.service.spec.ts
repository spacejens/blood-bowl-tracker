import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  FACT_SCOPE_ALL_TIME,
  TrophiesService,
} from '@blood-bowl-tracker/game-data';
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
import { TROPHY_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { EntityComponentsService } from '../../entity-components.service';
import {
  entityComponentsMock,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
} from '../../entity-components-mock.test-helpers';
import {
  TROPHIES_LIST_NO_DATA_MESSAGE,
  TROPHIES_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { ListDescriptionService } from '../../shared/list-description.service';
import { expectTimeoutFallback } from './toplist.test-helpers';
import { TrophiesListService } from './trophies-list.service';

type TrophyRow = {
  id: number;
  name: string;
  competitionGroupId: number;
  competitionGroupName: string;
};

let databaseTimeout: MockProxy<DatabaseTimeoutService>;

beforeEach(() => {
  databaseTimeout = mockDatabaseTimeout();
  // Tests that need the timeout branch override this per-call.
});

async function realListDescription(): Promise<ListDescriptionService> {
  const moduleRef = await Test.createTestingModule({
    providers: [ListDescriptionService],
  }).compile();
  return moduleRef.get(ListDescriptionService);
}

async function makeServiceFromTrophies(
  trophies: TrophiesService,
  entityComponents: MockProxy<EntityComponentsService> = passthroughEntityComponents(),
): Promise<TrophiesListService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TrophiesListService,
      { provide: TrophiesService, useValue: trophies },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      {
        provide: ListDescriptionService,
        // Pure, dependency-free formatter — its own truncation rules are
        // covered by list-description.service.spec.ts.
        useValue: await realListDescription(),
      },
    ],
  }).compile();
  return moduleRef.get(TrophiesListService);
}

async function makeService(
  rows: TrophyRow[],
  entityComponents?: MockProxy<EntityComponentsService>,
): Promise<TrophiesListService> {
  const trophies = mock<TrophiesService>();

  trophies.listAllWithLeague.mockResolvedValue(rows);
  return makeServiceFromTrophies(trophies, entityComponents);
}

describe('TrophiesListService.resolve', () => {
  it('returns the empty-state embed when there are no trophies', async () => {
    const result = await (await makeService([])).resolve(FACT_SCOPE_ALL_TIME);
    expect(result).toEqual({
      embeds: [
        { title: 'Trophies', description: TROPHIES_LIST_NO_DATA_MESSAGE },
      ],
    });
  });

  it('renders a single trophy with its group and a deepdive button', async () => {
    const service = await makeService([
      {
        id: 1,
        name: 'Chaos Cup',
        competitionGroupId: 3,
        competitionGroupName: 'Chaos Cup',
      },
    ]);
    const result = await service.resolve(FACT_SCOPE_ALL_TIME);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Trophies',
          description: 'Chaos Cup (Chaos Cup)',
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
              label: 'Chaos Cup',
              custom_id: `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}1`,
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('orders trophies by competition group, then by trophy name', async () => {
    const service = await makeService([
      // deliberately scrambled input order
      {
        id: 4,
        name: '2nd',
        competitionGroupId: 2,
        competitionGroupName: 'Minor Season',
      },
      {
        id: 2,
        name: '2nd',
        competitionGroupId: 1,
        competitionGroupName: 'Major Season',
      },
      {
        id: 5,
        name: 'Chaos Cup',
        competitionGroupId: 3,
        competitionGroupName: 'Chaos Cup',
      },
      {
        id: 1,
        name: '1st',
        competitionGroupId: 1,
        competitionGroupName: 'Major Season',
      },
      {
        id: 3,
        name: '1st',
        competitionGroupId: 2,
        competitionGroupName: 'Minor Season',
      },
    ]);
    const result = await service.resolve(FACT_SCOPE_ALL_TIME);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Trophies',
          description: [
            // groups alphabetical: Chaos Cup < Major Season < Minor Season
            'Chaos Cup (Chaos Cup)',
            // within a group, trophy name breaks the tie
            '1st (Major Season)',
            '2nd (Major Season)',
            '1st (Minor Season)',
            '2nd (Minor Season)',
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
              label: 'Chaos Cup',
              custom_id: `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}5`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: '1st',
              custom_id: `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}1`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: '2nd',
              custom_id: `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}2`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: '1st',
              custom_id: `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}3`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: '2nd',
              custom_id: `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}4`,
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('falls back to the stunned message when the trophy query times out', async () => {
    // The real timeout race is DatabaseTimeoutService's own responsibility
    // (covered by database-timeout.service.spec.ts); here databaseTimeout is a
    // mock, so this stubs its timeout branch directly rather than waiting on a
    // real timer.
    stubDatabaseTimeoutOnce(databaseTimeout);
    await expectTimeoutFallback(
      async (trophies: TrophiesService) =>
        (await makeServiceFromTrophies(trophies)).resolve(FACT_SCOPE_ALL_TIME),
      () => {
        const trophies = mock<TrophiesService>();

        trophies.listAllWithLeague.mockReturnValue(new Promise(() => {}));
        return trophies;
      },
      TROPHIES_LIST_TIMEOUT_MESSAGE,
    );
  });

  // The underlying cap/chunk/select logic is exercised in
  // entity-components.service.spec.ts. Here we only assert that
  // TrophiesListService hands EntityComponentsService one entry per trophy, in
  // the same order used for the embed text, labelled with the trophy name
  // alone (no group suffix).
  it('hands one entry per trophy to EntityComponentsService, in display order', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const service = await makeService(
      [
        {
          id: 2,
          name: 'Second',
          competitionGroupId: 9,
          competitionGroupName: 'Zeta Group',
        },
        {
          id: 1,
          name: 'First',
          competitionGroupId: 8,
          competitionGroupName: 'Alpha Group',
        },
      ],
      entityComponents,
    );
    await service.resolve(FACT_SCOPE_ALL_TIME);
    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'First',
      },
      {
        customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '2',
        label: 'Second',
      },
    ]);
  });

  it('appends the overflow note when some trophies got no link', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more without a link.',
    });
    const service = await makeService(
      [
        {
          id: 1,
          name: 'Chaos Cup',
          competitionGroupId: 3,
          competitionGroupName: 'Chaos Cup',
        },
      ],
      entityComponents,
    );
    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toBe(
      'Chaos Cup (Chaos Cup)\n…and 3 more without a link.',
    );
  });

  it('passes the league scope through to the query', async () => {
    const trophies = mock<TrophiesService>();

    trophies.listAllWithLeague.mockResolvedValue([]);
    const service = await makeServiceFromTrophies(trophies);
    const scope: FactScope = { leagueId: 7 };
    await service.resolve(scope);
    expect(trophies.listAllWithLeague).toHaveBeenCalledWith(scope);
  });

  it('truncates the description to the Discord embed cap when the trophy catalog is large', async () => {
    // trophies.list renders "<trophy> (<competition group>)" per row and grows
    // one row per group's placement set, so it can reach Discord's 4096-char
    // description cap well before the component overflow note kicks in.
    const rows: TrophyRow[] = Array.from({ length: 200 }, (_unused, index) => ({
      id: index,
      name: `Trophy Number ${index} With A Fairly Long Name`,
      competitionGroupId: index,
      competitionGroupName: 'The Rather Long Competition Group Name',
    }));
    const service = await makeService(rows);

    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };

    const description = result.embeds[0].description;
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });

  it('keeps the overflow note in full when the trophy list must be truncated to fit', async () => {
    const entityComponents = entityComponentsMock();
    const overflowNote = '…and 12345 more without a link.';
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote,
    });
    const rows: TrophyRow[] = Array.from({ length: 200 }, (_unused, index) => ({
      id: index,
      name: `Trophy Number ${index} With A Fairly Long Name`,
      competitionGroupId: index,
      competitionGroupName: 'The Rather Long Competition Group Name',
    }));
    const service = await makeService(rows, entityComponents);

    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };

    const description = result.embeds[0].description;
    expect(description.endsWith(`\n${overflowNote}`)).toBe(true);
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
  });
});

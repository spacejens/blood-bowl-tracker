import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  ErasService,
  FACT_SCOPE_ALL_TIME,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { ButtonStyle, ComponentType } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { ERA_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { EntityComponentsService } from '../../entity-components.service';
import { passthroughEntityComponents } from '../../entity-components-mock.test-helpers';
import {
  ERAS_LIST_NO_DATA_MESSAGE,
  ERAS_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { ErasListService } from './eras-list.service';
import { expectTimeoutFallback } from './toplist.test-helpers';

type EraRow = {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
};

let databaseTimeout: MockProxy<DatabaseTimeoutService>;

beforeEach(() => {
  databaseTimeout = mockDatabaseTimeout();
  // Tests that need the timeout branch override this per-call.
});

async function makeServiceFromEras(
  eras: ErasService,
  entityComponents: MockProxy<EntityComponentsService> = passthroughEntityComponents(),
): Promise<ErasListService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ErasListService,
      { provide: ErasService, useValue: eras },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return moduleRef.get(ErasListService);
}

async function makeService(
  rows: EraRow[],
  entityComponents?: MockProxy<EntityComponentsService>,
): Promise<ErasListService> {
  const eras = {
    listErasWithLeague: vi.fn().mockResolvedValue(rows),
  } as unknown as ErasService;
  return makeServiceFromEras(eras, entityComponents);
}

describe('ErasListService.resolve', () => {
  it('returns the empty-state embed when there are no eras', async () => {
    const result = await (await makeService([])).resolve(FACT_SCOPE_ALL_TIME);
    expect(result).toEqual({
      embeds: [{ title: 'Eras', description: ERAS_LIST_NO_DATA_MESSAGE }],
    });
  });

  it('renders a single era with a deepdive button and no inline rules', async () => {
    const service = await makeService([
      {
        id: 1,
        name: 'Season 1',
        leagueName: 'Premier',
        startDate: '2020-01-01',
        endDate: '2020-12-31',
      },
    ]);
    const result = await service.resolve(FACT_SCOPE_ALL_TIME);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras',
          description: 'Season 1 (Premier): 2020-01-01 – 2020-12-31',
        },
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}1`,
            },
          ],
        },
      ],
    });
  });

  it('renders an ongoing era with no end date as "present" and still attaches a deepdive button', async () => {
    const service = await makeService([
      {
        id: 1,
        name: 'Season 1',
        leagueName: 'Premier',
        startDate: '2020-01-01',
        endDate: null,
      },
    ]);
    const result = await service.resolve(FACT_SCOPE_ALL_TIME);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras',
          description: 'Season 1 (Premier): 2020-01-01 – present',
        },
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}1`,
            },
          ],
        },
      ],
    });
  });

  it('lists all eras in flat chronological order across leagues, breaking ties by league then era name', async () => {
    const service = await makeService([
      // deliberately scrambled input order
      {
        id: 4,
        name: 'B Season 2',
        leagueName: 'B League',
        startDate: '2022-01-01',
        endDate: null,
      },
      {
        id: 1,
        name: 'A Season 1',
        leagueName: 'A League',
        startDate: '2019-01-01',
        endDate: '2019-12-31',
      },
      // same startDate as id 6, different league -> league tie-break (A < B)
      {
        id: 5,
        name: 'Zeta',
        leagueName: 'A League',
        startDate: '2023-01-01',
        endDate: null,
      },
      {
        id: 3,
        name: 'A Season 2',
        leagueName: 'A League',
        startDate: '2021-01-01',
        endDate: '2021-12-31',
      },
      // same startDate/league as id 8, different name -> name tie-break (Alpha < Beta)
      {
        id: 7,
        name: 'Beta',
        leagueName: 'C League',
        startDate: '2024-01-01',
        endDate: null,
      },
      {
        id: 2,
        name: 'B Season 1',
        leagueName: 'B League',
        startDate: '2020-06-01',
        endDate: null,
      },
      {
        id: 6,
        name: 'Alpha',
        leagueName: 'B League',
        startDate: '2023-01-01',
        endDate: null,
      },
      {
        id: 8,
        name: 'Alpha',
        leagueName: 'C League',
        startDate: '2024-01-01',
        endDate: null,
      },
    ]);
    const result = await service.resolve(FACT_SCOPE_ALL_TIME);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras',
          description: [
            // interleaved across A and B leagues, purely by startDate
            'A Season 1 (A League): 2019-01-01 – 2019-12-31',
            'B Season 1 (B League): 2020-06-01 – present',
            'A Season 2 (A League): 2021-01-01 – 2021-12-31',
            'B Season 2 (B League): 2022-01-01 – present',
            // equal startDate 2023-01-01: league tie-break A before B
            'Zeta (A League): 2023-01-01 – present',
            'Alpha (B League): 2023-01-01 – present',
            // equal startDate 2024-01-01 and league C: name tie-break Alpha before Beta
            'Alpha (C League): 2024-01-01 – present',
            'Beta (C League): 2024-01-01 – present',
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
              style: ButtonStyle.Primary,
              label: 'A Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}1`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'B Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}2`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'A Season 2',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}3`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'B Season 2',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}4`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'Zeta',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}5`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'Alpha',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}6`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'Alpha',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}8`,
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              label: 'Beta',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}7`,
            },
          ],
        },
      ],
    });
  });

  it('falls back to the stunned message when the era query times out', async () => {
    // The real timeout race is DatabaseTimeoutService's own responsibility
    // (covered by database-timeout.service.spec.ts); here databaseTimeout is a
    // mock, so this stubs its timeout branch directly rather than waiting on a
    // real timer.
    stubDatabaseTimeoutOnce(databaseTimeout);
    await expectTimeoutFallback(
      async (eras: ErasService) =>
        (await makeServiceFromEras(eras)).resolve(FACT_SCOPE_ALL_TIME),
      () =>
        ({
          listErasWithLeague: vi.fn().mockReturnValue(new Promise(() => {})),
        }) as unknown as ErasService,
      ERAS_LIST_TIMEOUT_MESSAGE,
    );
  });

  // LeaderboardService.topRanksWithTies and the deepdive facts each have their
  // own version of this test; the underlying cap/chunk/select logic itself is
  // exercised in entity-components.service.spec.ts. Here we only assert that
  // ErasListService hands EntityComponentsService one entry per era, in the
  // same chronological order used for the embed text.
  it('hands one entry per era to EntityComponentsService, in chronological order', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const service = await makeService(
      [
        {
          id: 2,
          name: 'Second',
          leagueName: 'tLoEG',
          startDate: '2016-01-01',
          endDate: null,
        },
        {
          id: 1,
          name: 'First',
          leagueName: 'tLoEG',
          startDate: '2015-01-01',
          endDate: '2015-12-31',
        },
      ],
      entityComponents,
    );
    await service.resolve(FACT_SCOPE_ALL_TIME);
    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'First',
      },
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '2',
        label: 'Second',
      },
    ]);
  });

  it('appends the overflow note when some eras got no link', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more without a link.',
    });
    const service = await makeService(
      [
        {
          id: 1,
          name: 'First',
          leagueName: 'tLoEG',
          startDate: '2015-01-01',
          endDate: null,
        },
      ],
      entityComponents,
    );
    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toBe(
      'First (tLoEG): 2015-01-01 – present\n…and 3 more without a link.',
    );
  });

  it('passes the league scope through to the query', async () => {
    const listErasWithLeague = vi.fn().mockResolvedValue([]);
    const eras = { listErasWithLeague } as unknown as ErasService;
    const service = await makeServiceFromEras(eras);
    const scope: FactScope = { leagueId: 7 };
    await service.resolve(scope);
    expect(listErasWithLeague).toHaveBeenCalledWith(scope);
  });
});

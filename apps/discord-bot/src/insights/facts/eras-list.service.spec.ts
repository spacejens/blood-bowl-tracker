import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  ErasService,
  FACT_SCOPE_ALL_TIME,
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
import { ERA_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { EntityComponentsService } from '../../entity-components.service';
import {
  entityComponentsMock,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
} from '../../entity-components-mock.test-helpers';
import {
  ERAS_LIST_NO_DATA_MESSAGE,
  ERAS_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { DateRangeFormatterService } from '../../shared/date-range-formatter.service';
import { ListDescriptionService } from '../shared/list-description.service';
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
let dateRangeFormatter: MockProxy<DateRangeFormatterService>;

beforeEach(() => {
  databaseTimeout = mockDatabaseTimeout();
  dateRangeFormatter = mock<DateRangeFormatterService>();
  // Tests that need the timeout branch override this per-call.
  // Tests that assert on rendered text stub dateRangeFormatter.format
  // with the exact spans they expect; the real formatting logic is
  // covered by date-range-formatter.service.spec.ts.
});

async function realListDescription(): Promise<ListDescriptionService> {
  const moduleRef = await Test.createTestingModule({
    providers: [ListDescriptionService],
  }).compile();
  return moduleRef.get(ListDescriptionService);
}

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
      { provide: DateRangeFormatterService, useValue: dateRangeFormatter },
      {
        provide: ListDescriptionService,
        // Pure, dependency-free formatter — its own truncation rules are
        // covered by list-description.service.spec.ts.
        useValue: await realListDescription(),
      },
    ],
  }).compile();
  return moduleRef.get(ErasListService);
}

async function makeService(
  rows: EraRow[],
  entityComponents?: MockProxy<EntityComponentsService>,
): Promise<ErasListService> {
  const eras = mock<ErasService>();
  eras.listErasWithLeague.mockResolvedValue(rows);
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
    dateRangeFormatter.format.mockReturnValue('2020-01-01 – 2020-12-31');
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
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}1`,
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
    expect(dateRangeFormatter.format).toHaveBeenCalledWith(
      '2020-01-01',
      '2020-12-31',
    );
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
    dateRangeFormatter.format.mockReturnValue('2020-01-01 – present');
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
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}1`,
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
    expect(dateRangeFormatter.format).toHaveBeenCalledWith('2020-01-01', null);
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
    dateRangeFormatter.format
      .mockReturnValueOnce('2019-01-01 – 2019-12-31')
      .mockReturnValueOnce('2020-06-01 – present')
      .mockReturnValueOnce('2021-01-01 – 2021-12-31')
      .mockReturnValueOnce('2022-01-01 – present')
      .mockReturnValueOnce('2023-01-01 – present')
      .mockReturnValueOnce('2023-01-01 – present')
      .mockReturnValueOnce('2024-01-01 – present')
      .mockReturnValueOnce('2024-01-01 – present');
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
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'A Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}1`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'B Season 1',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}2`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'A Season 2',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}3`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'B Season 2',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}4`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Zeta',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}5`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Alpha',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}6`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Alpha',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}8`,
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: ComponentType.Button,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() matcher, not a real ButtonStyle
              style: expect.any(Number),
              label: 'Beta',
              custom_id: `${ERA_BUTTON_CUSTOM_ID_PREFIX}7`,
              emoji: STUB_BUTTON_EMOJI,
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
      () => {
        const eras = mock<ErasService>();
        eras.listErasWithLeague.mockReturnValue(new Promise(() => {}));
        return eras;
      },
      ERAS_LIST_TIMEOUT_MESSAGE,
    );
  });

  // LeaderboardService.topRanksWithTies and the deepdive facts each have their
  // own version of this test; the underlying cap/chunk/select logic itself is
  // exercised in entity-components.service.spec.ts. Here we only assert that
  // ErasListService hands EntityComponentsService one entry per era, in the
  // same chronological order used for the embed text.
  it('hands one entry per era to EntityComponentsService, in chronological order', async () => {
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
    const entityComponents = entityComponentsMock();
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
    dateRangeFormatter.format.mockReturnValue('2015-01-01 – present');
    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toBe(
      'First (tLoEG): 2015-01-01 – present\n…and 3 more without a link.',
    );
  });

  it('passes the league scope through to the query', async () => {
    const eras = mock<ErasService>();
    eras.listErasWithLeague.mockResolvedValue([]);
    const service = await makeServiceFromEras(eras);
    const scope: FactScope = { leagueId: 7 };
    await service.resolve(scope);
    expect(eras.listErasWithLeague).toHaveBeenCalledWith(scope);
  });

  it('truncates the description to the Discord embed cap when the era catalog is large', async () => {
    // Discord rejects the whole interaction when an embed description passes
    // MAX_DESCRIPTION_LENGTH, so the description must be capped independently
    // of EntityComponentsService's row-count-based overflow note.
    const rows: EraRow[] = Array.from({ length: 200 }, (_unused, index) => ({
      id: index,
      name: `Season Number ${index} With A Fairly Long Name`,
      leagueName: 'The Rather Long League Name',
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    }));
    dateRangeFormatter.format.mockReturnValue('2020-01-01 – 2020-12-31');
    const service = await makeService(rows);

    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };

    const description = result.embeds[0].description;
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });

  it('keeps the overflow note in full when the era list must be truncated to fit', async () => {
    const entityComponents = entityComponentsMock();
    const overflowNote = '…and 12345 more without a link.';
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote,
    });
    const rows: EraRow[] = Array.from({ length: 200 }, (_unused, index) => ({
      id: index,
      name: `Season Number ${index} With A Fairly Long Name`,
      leagueName: 'The Rather Long League Name',
      startDate: '2020-01-01',
      endDate: '2020-12-31',
    }));
    dateRangeFormatter.format.mockReturnValue('2020-01-01 – 2020-12-31');
    const service = await makeService(rows, entityComponents);

    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };

    const description = result.embeds[0].description;
    expect(description.endsWith(`\n${overflowNote}`)).toBe(true);
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
  });
});

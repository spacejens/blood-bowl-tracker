import {
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import {
  DEEPDIVE_COMPETITIONS_TIMEOUT_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_TIMEOUT_MESSAGE,
  DEEPDIVE_EXTERNAL_SYSTEMS_TIMEOUT_MESSAGE,
  DEEPDIVE_NO_COMPETITIONS_MESSAGE,
  DEEPDIVE_RULES_SET_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { EraDeepdiveService } from './era-deepdive.service';

type EraHeader = {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
};

interface MakeServiceOptions {
  eras: ErasService;
  competitions: CompetitionsService;
  externalSystems: ExternalSystemsService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  leaderboard?: MockProxy<LeaderboardService>;
}

/**
 * Defaults `buildEntityButtons` to return no components. LeaderboardService's
 * own button-building logic is covered by leaderboard.service.spec.ts; this
 * default exists only so tests that don't care about the exact button
 * composition (most of them - the description-rendering tests below) don't
 * need to configure a mock return value just to avoid the service's
 * unconditional call to it.
 */
function defaultLeaderboard(): MockProxy<LeaderboardService> {
  const leaderboard = mock<LeaderboardService>();
  leaderboard.buildEntityButtons.mockReturnValue([]);
  return leaderboard;
}

async function makeService({
  eras,
  competitions,
  externalSystems,
  databaseTimeout = mockDatabaseTimeout(),
  leaderboard = defaultLeaderboard(),
}: MakeServiceOptions): Promise<{
  service: EraDeepdiveService;
  leaderboard: MockProxy<LeaderboardService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      EraDeepdiveService,
      { provide: ErasService, useValue: eras },
      { provide: CompetitionsService, useValue: competitions },
      { provide: ExternalSystemsService, useValue: externalSystems },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: leaderboard },
    ],
  }).compile();
  return { service: moduleRef.get(EraDeepdiveService), leaderboard };
}

function makeServices(options: {
  era?: EraHeader;
  rulesSetNames?: string[];
  competitions?: { id: number; name: string; type: 'season' | 'cup' }[];
  externalSystemNames?: string[];
}): {
  eras: ErasService;
  competitions: CompetitionsService;
  externalSystems: ExternalSystemsService;
} {
  const eras = {
    findByIdWithLeague: vi.fn().mockResolvedValue(options.era),
    getRulesSetNames: vi.fn().mockResolvedValue(options.rulesSetNames ?? []),
  } as unknown as ErasService;
  const competitions = {
    listByEraChronological: vi
      .fn()
      .mockResolvedValue(options.competitions ?? []),
  } as unknown as CompetitionsService;
  const externalSystems = {
    listNamesByEra: vi
      .fn()
      .mockResolvedValue(options.externalSystemNames ?? []),
  } as unknown as ExternalSystemsService;
  return { eras, competitions, externalSystems };
}

describe('EraDeepdiveService', () => {
  it('returns the not-found message when the era does not exist', async () => {
    const { eras, competitions, externalSystems } = makeServices({
      era: undefined,
    });
    const { service } = await makeService({
      eras,
      competitions,
      externalSystems,
    });
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
  });

  it('renders league, dates, rules, and the competition list', async () => {
    const { eras, competitions, externalSystems } = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: '2023-06-10',
      },
      rulesSetNames: ['BB2016', 'BB2020'],
      externalSystemNames: ['BBL', 'NAF'],
      competitions: [
        { id: 10, name: 'Season 1', type: 'season' },
        { id: 11, name: 'Winter Cup', type: 'cup' },
      ],
    });
    const { service } = await makeService({
      eras,
      competitions,
      externalSystems,
    });
    const result = await service.resolve(1);
    expect(result).toMatchObject({
      embeds: [
        {
          title: 'BB2020',
          description: [
            'League: Premier',
            'Dates: 2021-09-01 – 2023-06-10',
            'Rules: BB2016, BB2020',
            'External systems: BBL, NAF',
            '',
            'Season 1 (season)',
            'Winter Cup (cup)',
          ].join('\n'),
        },
      ],
    });
  });

  it('shows "present" for an ongoing era and "None recorded" when it has no rules sets', async () => {
    const { eras, competitions, externalSystems } = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: null,
      },
      rulesSetNames: [],
      competitions: [{ id: 10, name: 'Season 1', type: 'season' }],
    });
    const { service } = await makeService({
      eras,
      competitions,
      externalSystems,
    });
    const result = await service.resolve(1);
    expect(result).toMatchObject({
      embeds: [
        {
          title: 'BB2020',
          description: [
            'League: Premier',
            'Dates: 2021-09-01 – present',
            'Rules: None recorded',
            'External systems: None recorded',
            '',
            'Season 1 (season)',
          ].join('\n'),
        },
      ],
    });
  });

  it('renders competitions in the order the service returns (played first, unplayed last)', async () => {
    const { eras, competitions, externalSystems } = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: null,
      },
      competitions: [
        { id: 10, name: 'Early Season', type: 'season' },
        { id: 11, name: 'Later Cup', type: 'cup' },
        { id: 12, name: 'Unplayed Cup', type: 'cup' },
      ],
    });
    const { service } = await makeService({
      eras,
      competitions,
      externalSystems,
    });
    const result = await service.resolve(1);
    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    const lines = description.split('\n');
    expect(lines.slice(-3)).toEqual([
      'Early Season (season)',
      'Later Cup (cup)',
      'Unplayed Cup (cup)',
    ]);
  });

  it('shows the no-competitions message when the era has none', async () => {
    const { eras, competitions, externalSystems } = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: '2023-06-10',
      },
      competitions: [],
    });
    const { service } = await makeService({
      eras,
      competitions,
      externalSystems,
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: 'BB2020',
          description: [
            'League: Premier',
            'Dates: 2021-09-01 – 2023-06-10',
            'Rules: None recorded',
            'External systems: None recorded',
            '',
            DEEPDIVE_NO_COMPETITIONS_MESSAGE,
          ].join('\n'),
        },
      ],
    });
  });

  it('shows "None recorded" when the era has no non-bookkeeping systems', async () => {
    const { eras, competitions, externalSystems } = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: null,
      },
      externalSystemNames: [],
      competitions: [{ id: 10, name: 'Season 1', type: 'season' }],
    });
    const { service } = await makeService({
      eras,
      competitions,
      externalSystems,
    });
    const result = await service.resolve(1);
    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description).toContain('External systems: None recorded');
  });

  // LeaderboardService.buildEntityButtons itself (dedupe/cap/chunk) is
  // covered by leaderboard.service.spec.ts. Here `leaderboard` is a mock
  // returning a canned button list, so this test asserts only what
  // EraDeepdiveService itself owns: the per-competition button-entry pool
  // (id/label pairs, one per competition) it hands to buildEntityButtons.
  it('builds one button entry per competition, keyed by competition id', async () => {
    const leaderboard = mock<LeaderboardService>();
    const cannedButtons = [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: 'canned', custom_id: 'canned' },
        ],
      },
    ];
    leaderboard.buildEntityButtons.mockReturnValue(cannedButtons);
    const { eras, competitions, externalSystems } = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: null,
      },
      competitions: [
        { id: 10, name: 'Season 1', type: 'season' },
        { id: 11, name: 'Spike Cup', type: 'cup' },
      ],
    });
    const { service } = await makeService({
      eras,
      competitions,
      externalSystems,
      leaderboard,
    });
    const result = (await service.resolve(1)) as unknown as {
      components: unknown;
    };
    expect(result.components).toBe(cannedButtons);
    const [entries, buildCustomId, label] =
      leaderboard.buildEntityButtons.mock.calls[0];
    expect(entries.map(buildCustomId)).toEqual([
      'deepdive:competition:10',
      'deepdive:competition:11',
    ]);
    expect(entries.map(label)).toEqual(['Season 1', 'Spike Cup']);
  });

  it('omits components when the era has no competitions', async () => {
    const { eras, competitions, externalSystems } = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: null,
      },
      competitions: [],
    });
    const { service } = await makeService({
      eras,
      competitions,
      externalSystems,
    });
    const result = await service.resolve(1);
    expect(result).not.toHaveProperty('components');
  });

  it('falls back to the era timeout message when the era lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { eras, competitions, externalSystems } = makeServices({});
        const { service } = await makeService({
          eras,
          competitions,
          externalSystems,
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_ERA_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the rules-set timeout message when the rules lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run.mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { eras, competitions, externalSystems } = makeServices({
          era: {
            id: 1,
            name: 'BB2020',
            leagueName: 'Premier',
            startDate: '2021-09-01',
            endDate: null,
          },
        });
        const { service } = await makeService({
          eras,
          competitions,
          externalSystems,
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_RULES_SET_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the competitions timeout message when the competition lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { eras, competitions, externalSystems } = makeServices({
          era: {
            id: 1,
            name: 'BB2020',
            leagueName: 'Premier',
            startDate: '2021-09-01',
            endDate: null,
          },
          rulesSetNames: [],
        });
        const { service } = await makeService({
          eras,
          competitions,
          externalSystems,
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COMPETITIONS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the external-systems timeout message when that lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { eras, competitions, externalSystems } = makeServices({
          era: {
            id: 1,
            name: 'BB2020',
            leagueName: 'Premier',
            startDate: '2021-09-01',
            endDate: null,
          },
          rulesSetNames: [],
          competitions: [],
        });
        const { service } = await makeService({
          eras,
          competitions,
          externalSystems,
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_EXTERNAL_SYSTEMS_TIMEOUT_MESSAGE,
    );
  });
});

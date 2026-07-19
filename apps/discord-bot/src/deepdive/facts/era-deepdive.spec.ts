import type {
  CompetitionsService,
  ErasService,
} from '@blood-bowl-tracker/game-data';
import { describe, expect, it, vi } from 'vitest';

import {
  DEEPDIVE_COMPETITIONS_TIMEOUT_MESSAGE,
  DEEPDIVE_ERA_NOT_FOUND_MESSAGE,
  DEEPDIVE_ERA_TIMEOUT_MESSAGE,
  DEEPDIVE_NO_COMPETITIONS_MESSAGE,
  DEEPDIVE_RULES_SET_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { resolveEraDeepdive } from './era-deepdive';

type EraHeader = {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
};

function makeServices(options: {
  era?: EraHeader;
  rulesSetNames?: string[];
  competitions?: { id: number; name: string; type: 'season' | 'cup' }[];
}): { eras: ErasService; competitions: CompetitionsService } {
  const eras = {
    findByIdWithLeague: vi.fn().mockResolvedValue(options.era),
    getRulesSetNames: vi.fn().mockResolvedValue(options.rulesSetNames ?? []),
  } as unknown as ErasService;
  const competitions = {
    listByEraChronological: vi
      .fn()
      .mockResolvedValue(options.competitions ?? []),
  } as unknown as CompetitionsService;
  return { eras, competitions };
}

describe('resolveEraDeepdive', () => {
  it('returns the not-found message when the era does not exist', async () => {
    const result = await resolveEraDeepdive(
      999,
      makeServices({ era: undefined }),
    );
    expect(result).toBe(DEEPDIVE_ERA_NOT_FOUND_MESSAGE);
  });

  it('renders league, dates, rules, and the competition list', async () => {
    const services = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: '2023-06-10',
      },
      rulesSetNames: ['BB2016', 'BB2020'],
      competitions: [
        { id: 10, name: 'Season 1', type: 'season' },
        { id: 11, name: 'Winter Cup', type: 'cup' },
      ],
    });
    const result = await resolveEraDeepdive(1, services);
    expect(result).toEqual({
      embeds: [
        {
          title: 'BB2020',
          description: [
            'League: Premier',
            'Dates: 2021-09-01 – 2023-06-10',
            'Rules: BB2016, BB2020',
            '',
            'Season 1 (season)',
            'Winter Cup (cup)',
          ].join('\n'),
        },
      ],
    });
  });

  it('shows "present" for an ongoing era and "None recorded" when it has no rules sets', async () => {
    const services = makeServices({
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
    const result = await resolveEraDeepdive(1, services);
    expect(result).toEqual({
      embeds: [
        {
          title: 'BB2020',
          description: [
            'League: Premier',
            'Dates: 2021-09-01 – present',
            'Rules: None recorded',
            '',
            'Season 1 (season)',
          ].join('\n'),
        },
      ],
    });
  });

  it('renders competitions in the order the service returns (played first, unplayed last)', async () => {
    const services = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: null,
      },
      // The service is responsible for the nulls-last SQL ordering; the
      // resolver must render exactly that order without re-sorting.
      competitions: [
        { id: 10, name: 'Early Season', type: 'season' },
        { id: 11, name: 'Later Cup', type: 'cup' },
        { id: 12, name: 'Unplayed Cup', type: 'cup' },
      ],
    });
    const result = await resolveEraDeepdive(1, services);
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
    const services = makeServices({
      era: {
        id: 1,
        name: 'BB2020',
        leagueName: 'Premier',
        startDate: '2021-09-01',
        endDate: '2023-06-10',
      },
      competitions: [],
    });
    const result = await resolveEraDeepdive(1, services);
    expect(result).toEqual({
      embeds: [
        {
          title: 'BB2020',
          description: [
            'League: Premier',
            'Dates: 2021-09-01 – 2023-06-10',
            'Rules: None recorded',
            '',
            DEEPDIVE_NO_COMPETITIONS_MESSAGE,
          ].join('\n'),
        },
      ],
    });
  });

  it('falls back to the era timeout message when the era lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { eras: ErasService; competitions: CompetitionsService }) =>
        resolveEraDeepdive(1, services),
      () => ({
        eras: {
          findByIdWithLeague: vi.fn().mockReturnValue(new Promise(() => {})),
          getRulesSetNames: vi.fn(),
        } as unknown as ErasService,
        competitions: {
          listByEraChronological: vi.fn(),
        } as unknown as CompetitionsService,
      }),
      DEEPDIVE_ERA_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the rules-set timeout message when the rules lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { eras: ErasService; competitions: CompetitionsService }) =>
        resolveEraDeepdive(1, services),
      () => ({
        eras: {
          findByIdWithLeague: vi.fn().mockResolvedValue({
            id: 1,
            name: 'BB2020',
            leagueName: 'Premier',
            startDate: '2021-09-01',
            endDate: null,
          }),
          getRulesSetNames: vi.fn().mockReturnValue(new Promise(() => {})),
        } as unknown as ErasService,
        competitions: {
          listByEraChronological: vi.fn(),
        } as unknown as CompetitionsService,
      }),
      DEEPDIVE_RULES_SET_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the competitions timeout message when the competition lookup times out', async () => {
    await expectTimeoutFallback(
      (services: { eras: ErasService; competitions: CompetitionsService }) =>
        resolveEraDeepdive(1, services),
      () => ({
        eras: {
          findByIdWithLeague: vi.fn().mockResolvedValue({
            id: 1,
            name: 'BB2020',
            leagueName: 'Premier',
            startDate: '2021-09-01',
            endDate: null,
          }),
          getRulesSetNames: vi.fn().mockResolvedValue([]),
        } as unknown as ErasService,
        competitions: {
          listByEraChronological: vi
            .fn()
            .mockReturnValue(new Promise(() => {})),
        } as unknown as CompetitionsService,
      }),
      DEEPDIVE_COMPETITIONS_TIMEOUT_MESSAGE,
    );
  });
});

import {
  CompetitionGroupsService,
  CompetitionsService,
  TrophiesService,
} from '@blood-bowl-tracker/game-data';
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
  nullEntityComponents,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_COMPETITION_GROUP_COMPETITIONS_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NO_COMPETITIONS_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NO_TROPHIES_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_GROUP_TROPHIES_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { DateRangeFormatterService } from '../../shared/date-range-formatter.service';
import {
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { CompetitionGroupDeepdiveService } from './competition-group-deepdive.service';

type GroupHeader = {
  id: number;
  name: string;
  leagueId: number;
  leagueName: string;
};

type GroupCompetition = {
  id: number;
  name: string;
  eraId: number;
  eraName: string;
  startDate: string;
  endDate: string | null;
};

interface MakeServiceOptions {
  competitionGroups: MockProxy<CompetitionGroupsService>;
  trophies?: MockProxy<TrophiesService>;
  competitions?: MockProxy<CompetitionsService>;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  dateRangeFormatter?: MockProxy<DateRangeFormatterService>;
}

async function makeService({
  competitionGroups,
  trophies = makeTrophies([]),
  competitions = makeCompetitions([]),
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = nullEntityComponents(),
  dateRangeFormatter = mock<DateRangeFormatterService>(),
}: MakeServiceOptions): Promise<{
  service: CompetitionGroupDeepdiveService;
  databaseTimeout: MockProxy<DatabaseTimeoutService>;
  entityComponents: MockProxy<EntityComponentsService>;
  dateRangeFormatter: MockProxy<DateRangeFormatterService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionGroupDeepdiveService,
      { provide: CompetitionGroupsService, useValue: competitionGroups },
      { provide: TrophiesService, useValue: trophies },
      { provide: CompetitionsService, useValue: competitions },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: DateRangeFormatterService, useValue: dateRangeFormatter },
    ],
  }).compile();
  return {
    service: moduleRef.get(CompetitionGroupDeepdiveService),
    databaseTimeout,
    entityComponents,
    dateRangeFormatter,
  };
}

function makeGroups(
  group: GroupHeader | undefined,
): MockProxy<CompetitionGroupsService> {
  const competitionGroups = mock<CompetitionGroupsService>();
  competitionGroups.findByIdWithLeague.mockResolvedValue(group);
  return competitionGroups;
}

function makeTrophies(
  rows: { id: number; name: string }[],
): MockProxy<TrophiesService> {
  const trophies = mock<TrophiesService>();
  trophies.listByCompetitionGroup.mockResolvedValue(rows);
  return trophies;
}

function makeCompetitions(
  rows: GroupCompetition[],
): MockProxy<CompetitionsService> {
  const competitions = mock<CompetitionsService>();
  competitions.listByCompetitionGroupChronological.mockResolvedValue(rows);
  return competitions;
}

const GROUP: GroupHeader = {
  id: 4,
  name: 'Chaos Cup',
  leagueId: 1,
  leagueName: 'The Major',
};

const COMPETITIONS: GroupCompetition[] = [
  {
    id: 11,
    name: 'Chaos Cup 23',
    eraId: 20,
    eraName: 'BB2020',
    startDate: '2023-10-01',
    endDate: '2023-10-02',
  },
  {
    id: 12,
    name: 'Chaos Cup 24',
    eraId: 21,
    eraName: 'BB2020 v2',
    startDate: '2024-10-01',
    endDate: null,
  },
];

const TROPHIES = [
  { id: 31, name: 'Chaos Cup Winner' },
  { id: 32, name: 'Most Casualties' },
];

describe('CompetitionGroupDeepdiveService', () => {
  it('returns the timeout message when the group lookup times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    stubDatabaseTimeoutOnce(databaseTimeout);
    const { service } = await makeService({
      competitionGroups: makeGroups(GROUP),
      databaseTimeout,
    });

    await expect(service.resolve(4)).resolves.toBe(
      DEEPDIVE_COMPETITION_GROUP_TIMEOUT_MESSAGE,
    );
  });

  it('returns the not-found message when no such group exists', async () => {
    const { service } = await makeService({
      competitionGroups: makeGroups(undefined),
    });

    await expect(service.resolve(4)).resolves.toBe(
      DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE,
    );
  });

  it('returns the trophies timeout message when the trophy list times out', async () => {
    // The first run() call is the group lookup and must succeed, so the
    // fallback-returning ("timed out") implementation is armed for the second
    // call only. mockDatabaseTimeout()'s default already passes work through,
    // and stubDatabaseTimeoutOnce arms exactly one timeout — but it arms the
    // *next* call, so it is queued after one pass-through call here.
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (_work, fallback) => fallback);
    const { service } = await makeService({
      competitionGroups: makeGroups(GROUP),
      databaseTimeout,
    });

    await expect(service.resolve(4)).resolves.toBe(
      DEEPDIVE_COMPETITION_GROUP_TROPHIES_TIMEOUT_MESSAGE,
    );
  });

  it('returns the competitions timeout message when the competition list times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (_work, fallback) => fallback);
    const { service } = await makeService({
      competitionGroups: makeGroups(GROUP),
      databaseTimeout,
    });

    await expect(service.resolve(4)).resolves.toBe(
      DEEPDIVE_COMPETITION_GROUP_COMPETITIONS_TIMEOUT_MESSAGE,
    );
  });

  it('renders the league, trophies and competitions, oldest competition first', async () => {
    const dateRangeFormatter = mock<DateRangeFormatterService>();
    dateRangeFormatter.format.mockImplementation(
      (start, end) => `${start}..${end ?? 'now'}`,
    );
    const { service } = await makeService({
      competitionGroups: makeGroups(GROUP),
      trophies: makeTrophies(TROPHIES),
      competitions: makeCompetitions(COMPETITIONS),
      dateRangeFormatter,
    });

    const result = await service.resolve(4);

    expect(result).toEqual({
      embeds: [
        {
          title: 'Chaos Cup',
          description: [
            'League: The Major',
            '',
            'Trophies:',
            'Chaos Cup Winner',
            'Most Casualties',
            '',
            'Competitions:',
            'Chaos Cup 23 (BB2020): 2023-10-01..2023-10-02',
            'Chaos Cup 24 (BB2020 v2): 2024-10-01..now',
          ].join('\n'),
        },
      ],
    });
  });

  it('says so when the group has no trophies and no competitions', async () => {
    const { service } = await makeService({
      competitionGroups: makeGroups(GROUP),
    });

    const result = await service.resolve(4);

    expect(result).toEqual({
      embeds: [
        {
          title: 'Chaos Cup',
          description: [
            'League: The Major',
            '',
            'Trophies:',
            DEEPDIVE_COMPETITION_GROUP_NO_TROPHIES_MESSAGE,
            '',
            'Competitions:',
            DEEPDIVE_COMPETITION_GROUP_NO_COMPETITIONS_MESSAGE,
          ].join('\n'),
        },
      ],
    });
  });

  it('offers a button per competition first, then one per trophy', async () => {
    const dateRangeFormatter = mock<DateRangeFormatterService>();
    dateRangeFormatter.format.mockReturnValue('dates');
    const { service, entityComponents } = await makeService({
      competitionGroups: makeGroups(GROUP),
      trophies: makeTrophies(TROPHIES),
      competitions: makeCompetitions(COMPETITIONS),
      entityComponents: passthroughEntityComponents(),
      dateRangeFormatter,
    });

    const result = await service.resolve(4);

    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '11',
        label: 'Chaos Cup 23',
      },
      {
        customIdPrefix: COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '12',
        label: 'Chaos Cup 24',
      },
      {
        customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '31',
        label: 'Chaos Cup Winner',
      },
      {
        customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '32',
        label: 'Most Casualties',
      },
    ]);
    const components = (result as { components: unknown[] }).components;
    expect(components).toHaveLength(1);
    expect(
      (
        components[0] as {
          components: { custom_id: string; emoji: unknown }[];
        }
      ).components.map((button) => button.custom_id),
    ).toEqual([
      `${COMPETITION_BUTTON_CUSTOM_ID_PREFIX}11`,
      `${COMPETITION_BUTTON_CUSTOM_ID_PREFIX}12`,
      `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}31`,
      `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}32`,
    ]);
    expect(
      (
        components[0] as {
          components: { custom_id: string; emoji: unknown }[];
        }
      ).components[0].emoji,
    ).toEqual(STUB_BUTTON_EMOJI);
  });

  it('appends the overflow note to the description when entries did not fit', async () => {
    const dateRangeFormatter = mock<DateRangeFormatterService>();
    dateRangeFormatter.format.mockReturnValue('dates');
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more without a link.',
    });
    const { service } = await makeService({
      competitionGroups: makeGroups(GROUP),
      competitions: makeCompetitions(COMPETITIONS),
      entityComponents,
      dateRangeFormatter,
    });

    const result = await service.resolve(4);

    expect(
      (result as { embeds: { description: string }[] }).embeds[0].description,
    ).toContain('…and 3 more without a link.');
  });
});

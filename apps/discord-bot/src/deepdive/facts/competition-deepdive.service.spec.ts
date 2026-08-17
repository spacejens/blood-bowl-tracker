import { CompetitionsService } from '@blood-bowl-tracker/game-data';
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
  DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_TEAM_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { TeamContextService } from '../../insights/team-context.service';
import { passthroughTeamContext } from '../../insights/team-context-mock.test-helpers';
import { DateRangeFormatterService } from '../../shared/date-range-formatter.service';
import {
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { CompetitionDeepdiveService } from './competition-deepdive.service';

interface MakeServiceOptions {
  competitions: CompetitionsService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  teamContext?: MockProxy<TeamContextService>;
  dateRangeFormatter?: MockProxy<DateRangeFormatterService>;
}

async function makeService({
  competitions,
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = nullEntityComponents(),
  teamContext = passthroughTeamContext(),
  dateRangeFormatter = mock<DateRangeFormatterService>(),
}: MakeServiceOptions): Promise<{
  service: CompetitionDeepdiveService;
  entityComponents: MockProxy<EntityComponentsService>;
  teamContext: MockProxy<TeamContextService>;
  dateRangeFormatter: MockProxy<DateRangeFormatterService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionDeepdiveService,
      { provide: CompetitionsService, useValue: competitions },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: TeamContextService, useValue: teamContext },
      { provide: DateRangeFormatterService, useValue: dateRangeFormatter },
    ],
  }).compile();
  return {
    service: moduleRef.get(CompetitionDeepdiveService),
    entityComponents,
    teamContext,
    dateRangeFormatter,
  };
}

type CompetitionHeaderFixture = {
  id: number;
  name: string;
  type: 'season' | 'cup';
  eraId: number;
  eraName: string;
  competitionGroupId: number;
  competitionGroupName: string;
  startDate: string;
  endDate: string | null;
};

function makeCompetitions(options: {
  competition?: CompetitionHeaderFixture;
  teams?: { id: number; name: string }[];
}): MockProxy<CompetitionsService> {
  const competitions = mock<CompetitionsService>();
  competitions.findByIdWithEra.mockResolvedValue(options.competition);
  competitions.listTeams.mockResolvedValue(options.teams ?? []);
  return competitions;
}

function competitionHeader(
  overrides: Partial<CompetitionHeaderFixture> = {},
): CompetitionHeaderFixture {
  return {
    id: 1,
    name: 'Major Season 24',
    type: 'season',
    eraId: 20,
    eraName: 'BB2020',
    competitionGroupId: 4,
    competitionGroupName: 'The Major',
    startDate: '2024-01-15',
    endDate: '2024-06-30',
    ...overrides,
  };
}

describe('CompetitionDeepdiveService', () => {
  it('returns the not-found message when the competition does not exist', async () => {
    const { service } = await makeService({
      competitions: makeCompetitions({ competition: undefined }),
    });
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE);
  });

  // EntityComponentsService's own dedupe/cap/chunk/select logic is covered
  // by entity-components.service.spec.ts. Here `entityComponents` is a mock
  // returning a canned component list, so this test asserts only what
  // CompetitionDeepdiveService itself owns: the type/era/teams description
  // text, and the teams-then-era entry pool (in that order — leaderboard
  // entries take component priority over header entries, with the right
  // ids/labels) it hands to buildEntityComponents.
  it('renders the type, era line, and participating-teams list (with context suffix), with the team entries before the era entry', async () => {
    const entityComponents = mock<EntityComponentsService>();
    const cannedComponents = [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: 'canned',
            custom_id: 'canned',
            emoji: STUB_BUTTON_EMOJI,
          },
        ],
      },
    ];
    entityComponents.buildEntityComponents.mockReturnValue({
      components: cannedComponents,
      overflowNote: null,
    });
    const dateRangeFormatter = mock<DateRangeFormatterService>();
    dateRangeFormatter.format.mockReturnValue('2024-01-15 – 2024-06-30');
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: [
          { id: 5, name: 'Gouged Eye' },
          { id: 9, name: 'Reikland Reavers' },
        ],
      }),
      entityComponents,
      teamContext: passthroughTeamContext(' (Orc, Skarsnik)'),
      dateRangeFormatter,
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Major Season 24',
          description: [
            'Type: season',
            'Era: BB2020',
            'Group: The Major',
            'Duration: 2024-01-15 – 2024-06-30',
            '',
            'Participating teams:',
            'Gouged Eye (Orc, Skarsnik)',
            'Reikland Reavers (Orc, Skarsnik)',
          ].join('\n'),
        },
      ],
      components: cannedComponents,
    });
    const [entries] = entityComponents.buildEntityComponents.mock.calls[0];
    expect(entries).toEqual([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '5',
        label: 'Gouged Eye',
      },
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '9',
        label: 'Reikland Reavers',
      },
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '20',
        label: 'BB2020',
      },
      {
        customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '4',
        label: 'The Major',
      },
    ]);
    expect(dateRangeFormatter.format).toHaveBeenCalledWith(
      '2024-01-15',
      '2024-06-30',
    );
  });

  it('renders the Duration line for a multi-day competition, between the era line and the teams block', async () => {
    const dateRangeFormatter = mock<DateRangeFormatterService>();
    dateRangeFormatter.format.mockReturnValue('2024-01-15 – 2024-06-30');
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader({
          startDate: '2024-01-15',
          endDate: '2024-06-30',
        }),
        teams: [{ id: 5, name: 'Gouged Eye' }],
      }),
      dateRangeFormatter,
    });
    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines.slice(0, 6)).toEqual([
      'Type: season',
      'Era: BB2020',
      'Group: The Major',
      'Duration: 2024-01-15 – 2024-06-30',
      '',
      'Participating teams:',
    ]);
    expect(dateRangeFormatter.format).toHaveBeenCalledWith(
      '2024-01-15',
      '2024-06-30',
    );
  });

  it('renders the Duration line for an ongoing competition', async () => {
    const dateRangeFormatter = mock<DateRangeFormatterService>();
    dateRangeFormatter.format.mockReturnValue('2024-01-15 – present');
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader({
          startDate: '2024-01-15',
          endDate: null,
        }),
        teams: [{ id: 5, name: 'Gouged Eye' }],
      }),
      dateRangeFormatter,
    });
    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')).toContain(
      'Duration: 2024-01-15 – present',
    );
    expect(dateRangeFormatter.format).toHaveBeenCalledWith('2024-01-15', null);
  });

  it('renders the Duration line for a single-day competition', async () => {
    const dateRangeFormatter = mock<DateRangeFormatterService>();
    dateRangeFormatter.format.mockReturnValue('2024-03-16');
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader({
          type: 'cup',
          startDate: '2024-03-16',
          endDate: '2024-03-16',
        }),
        teams: [{ id: 5, name: 'Gouged Eye' }],
      }),
      dateRangeFormatter,
    });
    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')).toContain(
      'Duration: 2024-03-16',
    );
    expect(dateRangeFormatter.format).toHaveBeenCalledWith(
      '2024-03-16',
      '2024-03-16',
    );
  });

  it('calls attachSuffixes with both race and coach context enabled', async () => {
    const teamContext = mock<TeamContextService>();
    const rawTeams = [
      { id: 5, name: 'Gouged Eye' },
      { id: 9, name: 'Reikland Reavers' },
    ];
    teamContext.attachSuffixes.mockResolvedValue(
      rawTeams.map((team) => ({ ...team, contextSuffix: '' })),
    );
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: rawTeams,
      }),
      teamContext,
    });
    await service.resolve(1);
    expect(teamContext.attachSuffixes).toHaveBeenCalledTimes(1);
    const [inputRows, teamIdOf, options] =
      teamContext.attachSuffixes.mock.calls[0];
    expect(inputRows).toEqual(rawTeams);
    expect(teamIdOf(rawTeams[0])).toBe(5);
    expect(options).toEqual({ includeRace: true, includeCoach: true });
  });

  it('shows the no-teams message but still passes the era-only entry to buildEntityComponents', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader({ type: 'cup' }),
        teams: [],
      }),
      entityComponents,
    });
    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toContain(
      DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE,
    );
    const [entries] = entityComponents.buildEntityComponents.mock.calls[0];
    expect(entries).toEqual([
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '20',
        label: 'BB2020',
      },
      {
        customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '4',
        label: 'The Major',
      },
    ]);
  });

  it('keeps the no-teams placeholder free of any context suffix even when attachSuffixes would attach one', async () => {
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader({ type: 'cup' }),
        teams: [],
      }),
      teamContext: passthroughTeamContext(' (Orc, Skarsnik)'),
    });
    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain(DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE);
  });

  it('still labels the team buttons with the plain team name', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: [{ id: 5, name: 'Gouged Eye' }],
      }),
      entityComponents,
      teamContext: passthroughTeamContext(' (Orc, Skarsnik)'),
    });
    await service.resolve(1);
    const [entries] = entityComponents.buildEntityComponents.mock.calls[0];
    expect(entries).toEqual([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '5',
        label: 'Gouged Eye',
      },
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '20',
        label: 'BB2020',
      },
      {
        customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '4',
        label: 'The Major',
      },
    ]);
  });

  it('offers a drill-up button to the competition group, last of all', async () => {
    const dateRangeFormatter = mock<DateRangeFormatterService>();
    dateRangeFormatter.format.mockReturnValue('dates');
    const { service, entityComponents } = await makeService({
      competitions: makeCompetitions({
        competition: {
          id: 1,
          name: 'Chaos Cup 24',
          type: 'cup',
          eraId: 20,
          eraName: 'BB2020',
          competitionGroupId: 4,
          competitionGroupName: 'Chaos Cup',
          startDate: '2024-10-01',
          endDate: '2024-10-02',
        },
        teams: [{ id: 5, name: 'Gouged Eye' }],
      }),
      entityComponents: passthroughEntityComponents(),
      dateRangeFormatter,
    });

    await service.resolve(1);

    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '5',
        label: 'Gouged Eye',
      },
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '20',
        label: 'BB2020',
      },
      {
        customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '4',
        label: 'Chaos Cup',
      },
    ]);
  });

  it('falls back to the competition timeout message when the header lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          competitions: makeCompetitions({}),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the teams timeout message when the teams lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run.mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          competitions: makeCompetitions({
            competition: competitionHeader(),
          }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the team-context timeout message when attachSuffixes times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          competitions: makeCompetitions({
            competition: competitionHeader(),
            teams: [{ id: 5, name: 'Gouged Eye' }],
          }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COMPETITION_TEAM_CONTEXT_TIMEOUT_MESSAGE,
    );
  });
});

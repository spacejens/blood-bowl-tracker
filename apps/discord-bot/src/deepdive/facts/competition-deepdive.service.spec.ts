import type { CompetitionTrophyAward } from '@blood-bowl-tracker/game-data';
import {
  CompetitionsService,
  TrophyAwardsService,
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
  entityComponentsMock,
  nullEntityComponents,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
  stubEntityEmoji,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE,
  DEEPDIVE_COMPETITION_NO_TROPHIES_MESSAGE,
  DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_COMPETITION_TEAM_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TROPHIES_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TROPHY_CONTEXT_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { PlayerContextService } from '../../insights/player-context.service';
import { passthroughPlayerContext } from '../../insights/player-context-mock.test-helpers';
import { TeamContextService } from '../../insights/team-context.service';
import { passthroughTeamContext } from '../../insights/team-context-mock.test-helpers';
import { DateRangeFormatterService } from '../../shared/date-range-formatter.service';
import {
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { CompetitionDeepdiveService } from './competition-deepdive.service';

interface MakeServiceOptions {
  competitions: CompetitionsService;
  trophyAwards?: MockProxy<TrophyAwardsService>;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  teamContext?: MockProxy<TeamContextService>;
  playerContext?: MockProxy<PlayerContextService>;
  dateRangeFormatter?: MockProxy<DateRangeFormatterService>;
}

async function makeService({
  competitions,
  trophyAwards = makeTrophyAwards([]),
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = nullEntityComponents(),
  teamContext = passthroughTeamContext(),
  playerContext = passthroughPlayerContext(),
  dateRangeFormatter = mock<DateRangeFormatterService>(),
}: MakeServiceOptions): Promise<{
  service: CompetitionDeepdiveService;
  entityComponents: MockProxy<EntityComponentsService>;
  teamContext: MockProxy<TeamContextService>;
  playerContext: MockProxy<PlayerContextService>;
  dateRangeFormatter: MockProxy<DateRangeFormatterService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionDeepdiveService,
      { provide: CompetitionsService, useValue: competitions },
      { provide: TrophyAwardsService, useValue: trophyAwards },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: TeamContextService, useValue: teamContext },
      { provide: PlayerContextService, useValue: playerContext },
      { provide: DateRangeFormatterService, useValue: dateRangeFormatter },
    ],
  }).compile();
  return {
    service: moduleRef.get(CompetitionDeepdiveService),
    entityComponents,
    teamContext,
    playerContext,
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

function makeTrophyAwards(
  awards: CompetitionTrophyAward[],
): MockProxy<TrophyAwardsService> {
  const trophyAwards = mock<TrophyAwardsService>();
  trophyAwards.listForCompetition.mockResolvedValue(awards);
  return trophyAwards;
}

function teamAward(
  overrides: Partial<CompetitionTrophyAward> = {},
): CompetitionTrophyAward {
  return {
    trophyId: 70,
    trophyName: 'Season Gold',
    recipientKind: 'team',
    teamId: 5,
    teamName: 'Gouged Eye',
    playerId: null,
    playerName: null,
    ...overrides,
  };
}

function playerAward(
  overrides: Partial<CompetitionTrophyAward> = {},
): CompetitionTrophyAward {
  return {
    trophyId: 71,
    trophyName: 'Most Valuable Player',
    recipientKind: 'player',
    teamId: 9,
    teamName: 'Reikland Reavers',
    playerId: 40,
    playerName: 'Griff Oberwald',
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
    const entityComponents = entityComponentsMock();
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
          title: `${stubEntityEmoji(COMPETITION_BUTTON_CUSTOM_ID_PREFIX)} Major Season 24`,
          description: [
            'Type: season',
            'Era: BB2020',
            'Group: The Major',
            'Duration: 2024-01-15 – 2024-06-30',
            '',
            'Participating teams:',
            'Gouged Eye (Orc, Skarsnik)',
            'Reikland Reavers (Orc, Skarsnik)',
            '',
            DEEPDIVE_COMPETITION_NO_TROPHIES_MESSAGE,
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
    const entityComponents = entityComponentsMock();
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
    const entityComponents = entityComponentsMock();
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

  it('renders the no-trophies message when the competition awarded nothing', async () => {
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: [{ id: 5, name: 'Gouged Eye' }],
      }),
      trophyAwards: makeTrophyAwards([]),
    });
    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain(DEEPDIVE_COMPETITION_NO_TROPHIES_MESSAGE);
    expect(lines).not.toContain('Trophies & awards:');
  });

  it('skips the recipient-context lookup entirely when the competition awarded nothing', async () => {
    const playerContext = passthroughPlayerContext();
    const { service, teamContext } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: [{ id: 5, name: 'Gouged Eye' }],
      }),
      trophyAwards: makeTrophyAwards([]),
      playerContext,
    });
    await service.resolve(1);
    // Only the participating-teams decoration runs; nothing decorates awards.
    expect(teamContext.attachSuffixes).toHaveBeenCalledTimes(1);
    expect(playerContext.attachSuffixes).not.toHaveBeenCalled();
  });

  it('renders a team award with its race/coach context, after the participating-teams block', async () => {
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: [{ id: 5, name: 'Gouged Eye' }],
      }),
      trophyAwards: makeTrophyAwards([teamAward()]),
      teamContext: passthroughTeamContext(' (Orc, Skarsnik)'),
    });
    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')).toEqual([
      'Type: season',
      'Era: BB2020',
      'Group: The Major',
      'Duration: undefined',
      '',
      'Participating teams:',
      'Gouged Eye (Orc, Skarsnik)',
      '',
      'Trophies & awards:',
      'Season Gold: Gouged Eye (Orc, Skarsnik)',
    ]);
  });

  it('renders a player award with its position/team/race/coach context', async () => {
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: [],
      }),
      trophyAwards: makeTrophyAwards([playerAward()]),
      playerContext: passthroughPlayerContext(
        ' (Blitzer, Reikland Reavers, Human, Ludwig)',
      ),
    });
    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')).toContain(
      'Most Valuable Player: Griff Oberwald (Blitzer, Reikland Reavers, Human, Ludwig)',
    );
  });

  it('renders team and player awards together, in the order the query returned them', async () => {
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: [],
      }),
      trophyAwards: makeTrophyAwards([teamAward(), playerAward()]),
    });
    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines.slice(lines.indexOf('Trophies & awards:'))).toEqual([
      'Trophies & awards:',
      'Season Gold: Gouged Eye',
      'Most Valuable Player: Griff Oberwald',
    ]);
  });

  it('decorates team awards and player awards with the right context options', async () => {
    const teamContext = passthroughTeamContext();
    const playerContext = passthroughPlayerContext();
    const awards = [teamAward(), playerAward()];
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: [],
      }),
      trophyAwards: makeTrophyAwards(awards),
      teamContext,
      playerContext,
    });

    await service.resolve(1);

    // Call 0 decorates the (empty) participating-teams list; call 1 decorates
    // the team-kind award rows only.
    const [teamRows, teamIdOf, teamOptions] =
      teamContext.attachSuffixes.mock.calls[1];
    expect(teamRows).toEqual([awards[0]]);
    expect(teamIdOf(awards[0])).toBe(5);
    expect(teamOptions).toEqual({ includeRace: true, includeCoach: true });

    const [playerRows, playerIdOf, playerOptions] =
      playerContext.attachSuffixes.mock.calls[0];
    expect(playerRows).toEqual([awards[1]]);
    expect(playerIdOf(awards[1])).toBe(40);
    expect(playerOptions).toEqual({
      includePosition: true,
      includeTeam: true,
      includeRace: true,
      includeEra: false,
      includeCoach: true,
    });
  });

  it('adds recipient and distinct-trophy entries between the team entries and the era entry, deduping a trophy shared by several awards', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    // Two awards of the same trophy (a tie) plus one player award: the tied
    // trophy must contribute exactly one trophy entry.
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: competitionHeader(),
        teams: [{ id: 5, name: 'Gouged Eye' }],
      }),
      trophyAwards: makeTrophyAwards([
        teamAward(),
        teamAward({ teamId: 9, teamName: 'Reikland Reavers' }),
        playerAward(),
      ]),
      entityComponents,
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
        customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '40',
        label: 'Griff Oberwald',
      },
      {
        customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '70',
        label: 'Season Gold',
      },
      {
        customIdPrefix: TROPHY_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '71',
        label: 'Most Valuable Player',
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

  it('falls back to the trophies timeout message when the awards lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
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
      DEEPDIVE_COMPETITION_TROPHIES_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the trophy-context timeout message when decorating the award recipients times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          competitions: makeCompetitions({
            competition: competitionHeader(),
            teams: [{ id: 5, name: 'Gouged Eye' }],
          }),
          trophyAwards: makeTrophyAwards([teamAward()]),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COMPETITION_TROPHY_CONTEXT_TIMEOUT_MESSAGE,
    );
  });
});

import { CompetitionsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { EntityComponentsService } from '../../entity-components.service';
import { nullEntityComponents } from '../../entity-components-mock.test-helpers';
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
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { CompetitionDeepdiveService } from './competition-deepdive.service';

interface MakeServiceOptions {
  competitions: CompetitionsService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  teamContext?: MockProxy<TeamContextService>;
}

async function makeService({
  competitions,
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = nullEntityComponents(),
  teamContext = passthroughTeamContext(),
}: MakeServiceOptions): Promise<{
  service: CompetitionDeepdiveService;
  entityComponents: MockProxy<EntityComponentsService>;
  teamContext: MockProxy<TeamContextService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionDeepdiveService,
      { provide: CompetitionsService, useValue: competitions },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: TeamContextService, useValue: teamContext },
    ],
  }).compile();
  return {
    service: moduleRef.get(CompetitionDeepdiveService),
    entityComponents,
    teamContext,
  };
}

function makeCompetitions(options: {
  competition?: {
    id: number;
    name: string;
    type: 'season' | 'cup';
    eraId: number;
    eraName: string;
  };
  teams?: { id: number; name: string }[];
}): CompetitionsService {
  return {
    findByIdWithEra: vi.fn().mockResolvedValue(options.competition),
    listTeams: vi.fn().mockResolvedValue(options.teams ?? []),
  } as unknown as CompetitionsService;
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
          { type: 2, style: 1, label: 'canned', custom_id: 'canned' },
        ],
      },
    ];
    entityComponents.buildEntityComponents.mockReturnValue({
      components: cannedComponents,
      overflowNote: null,
    });
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: {
          id: 1,
          name: 'Major Season 24',
          type: 'season',
          eraId: 20,
          eraName: 'BB2020',
        },
        teams: [
          { id: 5, name: 'Gouged Eye' },
          { id: 9, name: 'Reikland Reavers' },
        ],
      }),
      entityComponents,
      teamContext: passthroughTeamContext(' (Orc, Skarsnik)'),
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Major Season 24',
          description: [
            'Type: season',
            'Era: BB2020',
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
    ]);
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
        competition: {
          id: 1,
          name: 'Major Season 24',
          type: 'season',
          eraId: 20,
          eraName: 'BB2020',
        },
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
        competition: {
          id: 1,
          name: 'Major Season 24',
          type: 'cup',
          eraId: 20,
          eraName: 'BB2020',
        },
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
    ]);
  });

  it('keeps the no-teams placeholder free of any context suffix even when attachSuffixes would attach one', async () => {
    const { service } = await makeService({
      competitions: makeCompetitions({
        competition: {
          id: 1,
          name: 'Major Season 24',
          type: 'cup',
          eraId: 20,
          eraName: 'BB2020',
        },
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
        competition: {
          id: 1,
          name: 'Major Season 24',
          type: 'season',
          eraId: 20,
          eraName: 'BB2020',
        },
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
            competition: {
              id: 1,
              name: 'Major Season 24',
              type: 'season',
              eraId: 20,
              eraName: 'BB2020',
            },
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
            competition: {
              id: 1,
              name: 'Major Season 24',
              type: 'season',
              eraId: 20,
              eraName: 'BB2020',
            },
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

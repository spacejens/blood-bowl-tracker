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
  DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { CompetitionDeepdiveService } from './competition-deepdive.service';

async function makeService(
  competitions: CompetitionsService,
  databaseTimeout: MockProxy<DatabaseTimeoutService> = mockDatabaseTimeout(),
  entityComponents: MockProxy<EntityComponentsService> = nullEntityComponents(),
): Promise<{
  service: CompetitionDeepdiveService;
  entityComponents: MockProxy<EntityComponentsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionDeepdiveService,
      { provide: CompetitionsService, useValue: competitions },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();
  return {
    service: moduleRef.get(CompetitionDeepdiveService),
    entityComponents,
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
    const { service } = await makeService(
      makeCompetitions({ competition: undefined }),
    );
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE);
  });

  // EntityComponentsService's own dedupe/cap/chunk/select logic is covered
  // by entity-components.service.spec.ts. Here `entityComponents` is a mock
  // returning a canned component list, so this test asserts only what
  // CompetitionDeepdiveService itself owns: the type/era/teams description
  // text, and the era-then-teams entry pool (in that order, with the right
  // ids/labels) it hands to buildEntityComponents.
  it('renders the type, era line, and participating-teams list, with the era entry before team entries', async () => {
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
    const { service } = await makeService(
      makeCompetitions({
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
      undefined,
      entityComponents,
    );
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
            'Gouged Eye',
            'Reikland Reavers',
          ].join('\n'),
        },
      ],
      components: cannedComponents,
    });
    const [entries] = entityComponents.buildEntityComponents.mock.calls[0];
    expect(entries).toEqual([
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '20',
        label: 'BB2020',
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
    ]);
  });

  it('shows the no-teams message but still passes the era-only entry to buildEntityComponents', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const { service } = await makeService(
      makeCompetitions({
        competition: {
          id: 1,
          name: 'Major Season 24',
          type: 'cup',
          eraId: 20,
          eraName: 'BB2020',
        },
        teams: [],
      }),
      undefined,
      entityComponents,
    );
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

  it('falls back to the competition timeout message when the header lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService(
          makeCompetitions({}),
          databaseTimeout,
        );
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
        const { service } = await makeService(
          makeCompetitions({
            competition: {
              id: 1,
              name: 'Major Season 24',
              type: 'season',
              eraId: 20,
              eraName: 'BB2020',
            },
          }),
          databaseTimeout,
        );
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE,
    );
  });
});

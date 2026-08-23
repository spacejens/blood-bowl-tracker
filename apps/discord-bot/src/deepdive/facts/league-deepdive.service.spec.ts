import {
  CompetitionGroupsService,
  LeaguesService,
  TrophiesService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { ButtonStyle, ComponentType } from 'discord.js';
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
  STUB_BUTTON_EMOJI,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_LEAGUE_COMPETITION_GROUPS_TIMEOUT_MESSAGE,
  DEEPDIVE_LEAGUE_NO_COMPETITION_GROUPS_MESSAGE,
  DEEPDIVE_LEAGUE_NO_TROPHIES_MESSAGE,
  DEEPDIVE_LEAGUE_NOT_FOUND_MESSAGE,
  DEEPDIVE_LEAGUE_TIMEOUT_MESSAGE,
  DEEPDIVE_LEAGUE_TROPHIES_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeagueDeepdiveService } from './league-deepdive.service';

type LeagueHeader = { id: number; name: string };
type Trophy = { id: number; name: string };
type Group = { id: number; name: string };

function makeLeagues(
  league: LeagueHeader | undefined,
): MockProxy<LeaguesService> {
  const leagues = mock<LeaguesService>();

  leagues.findById.mockResolvedValue(league);
  return leagues;
}

function makeTrophies(rows: Trophy[]): MockProxy<TrophiesService> {
  const trophies = mock<TrophiesService>();

  trophies.listByLeague.mockResolvedValue(rows);
  return trophies;
}

function makeGroups(rows: Group[]): MockProxy<CompetitionGroupsService> {
  const competitionGroups = mock<CompetitionGroupsService>();

  competitionGroups.listByLeague.mockResolvedValue(rows);
  return competitionGroups;
}

async function makeService(options: {
  leagues: MockProxy<LeaguesService>;
  trophies?: MockProxy<TrophiesService>;
  competitionGroups?: MockProxy<CompetitionGroupsService>;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
}): Promise<{
  service: LeagueDeepdiveService;
  databaseTimeout: MockProxy<DatabaseTimeoutService>;
  entityComponents: MockProxy<EntityComponentsService>;
}> {
  const {
    leagues,
    trophies = makeTrophies([]),
    competitionGroups = makeGroups([]),
    databaseTimeout = mockDatabaseTimeout(),
    entityComponents = mock<EntityComponentsService>(),
  } = options;

  entityComponents.buildEntityComponents.mockReturnValue({
    components: [],
    overflowNote: null,
  });
  entityComponents.getEmojiForPrefix.mockReturnValue('🏛️');

  const moduleRef = await Test.createTestingModule({
    providers: [
      LeagueDeepdiveService,
      { provide: LeaguesService, useValue: leagues },
      { provide: CompetitionGroupsService, useValue: competitionGroups },
      { provide: TrophiesService, useValue: trophies },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
    ],
  }).compile();

  return {
    service: moduleRef.get(LeagueDeepdiveService),
    databaseTimeout,
    entityComponents,
  };
}

describe('LeagueDeepdiveService', () => {
  it('renders the league header, its groups and its own trophies', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    entityComponents.getEmojiForPrefix.mockReturnValue('🏛️');
    const { service } = await makeService({
      leagues: makeLeagues({ id: 7, name: 'tLoEG' }),
      trophies: makeTrophies([{ id: 3, name: 'Legendary Player' }]),
      competitionGroups: makeGroups([
        { id: 1, name: 'Major Season' },
        { id: 2, name: 'Chaos Cup' },
      ]),
      databaseTimeout,
      entityComponents,
    });

    const reply = await service.resolve(7);

    expect(reply).toMatchObject({
      embeds: [{ title: '🏛️ tLoEG' }],
    });
    const description = (reply as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description).toContain('Legendary Player');
    expect(description).toContain('Major Season');
    expect(description).toContain('Chaos Cup');
    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: 'deepdive:competition-group:',
        entityId: '1',
        label: 'Major Season',
      },
      {
        customIdPrefix: 'deepdive:competition-group:',
        entityId: '2',
        label: 'Chaos Cup',
      },
      {
        customIdPrefix: 'deepdive:trophy:',
        entityId: '3',
        label: 'Legendary Player',
      },
    ]);
  });

  it('reports no such league', async () => {
    const { service } = await makeService({
      leagues: makeLeagues(undefined),
    });

    expect(await service.resolve(7)).toBe(DEEPDIVE_LEAGUE_NOT_FOUND_MESSAGE);
  });

  it('reports a header timeout', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    stubDatabaseTimeoutOnce(databaseTimeout);
    const { service } = await makeService({
      leagues: makeLeagues({ id: 7, name: 'tLoEG' }),
      databaseTimeout,
    });

    expect(await service.resolve(7)).toBe(DEEPDIVE_LEAGUE_TIMEOUT_MESSAGE);
  });

  it('reports a trophies timeout', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (_work, fallback) => fallback);
    const { service } = await makeService({
      leagues: makeLeagues({ id: 7, name: 'tLoEG' }),
      databaseTimeout,
    });

    expect(await service.resolve(7)).toBe(
      DEEPDIVE_LEAGUE_TROPHIES_TIMEOUT_MESSAGE,
    );
  });

  it('reports a competition groups timeout', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (_work, fallback) => fallback);
    const { service } = await makeService({
      leagues: makeLeagues({ id: 7, name: 'tLoEG' }),
      trophies: makeTrophies([]),
      databaseTimeout,
    });

    expect(await service.resolve(7)).toBe(
      DEEPDIVE_LEAGUE_COMPETITION_GROUPS_TIMEOUT_MESSAGE,
    );
  });

  it('includes components and the overflow note when entries did not fit', async () => {
    const entityComponents = entityComponentsMock();
    const { service } = await makeService({
      leagues: makeLeagues({ id: 7, name: 'tLoEG' }),
      trophies: makeTrophies([{ id: 3, name: 'Legendary Player' }]),
      competitionGroups: makeGroups([{ id: 1, name: 'Major Season' }]),
      entityComponents,
    });
    const components = [
      {
        type: ComponentType.ActionRow as const,
        components: [
          {
            type: ComponentType.Button as const,
            style: ButtonStyle.Primary as const,
            label: 'Legendary Player',
            custom_id: 'deepdive:trophy:3',
            emoji: STUB_BUTTON_EMOJI,
          },
        ],
      },
    ];
    entityComponents.buildEntityComponents.mockReturnValue({
      components,
      overflowNote: '…and 3 more without a link.',
    });

    const reply = await service.resolve(7);

    expect(reply).toMatchObject({ components });
    const description = (reply as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description).toContain('…and 3 more without a link.');
  });

  it('says so when the league has no trophies and no groups', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    entityComponents.getEmojiForPrefix.mockReturnValue('🏛️');
    const { service } = await makeService({
      leagues: makeLeagues({ id: 7, name: 'tLoEG' }),
      trophies: makeTrophies([]),
      competitionGroups: makeGroups([]),
      entityComponents,
    });

    const reply = await service.resolve(7);

    const description = (reply as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description).toContain(DEEPDIVE_LEAGUE_NO_TROPHIES_MESSAGE);
    expect(description).toContain(
      DEEPDIVE_LEAGUE_NO_COMPETITION_GROUPS_MESSAGE,
    );
  });
});

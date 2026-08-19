import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  CompetitionGroupsService,
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
import { COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { EntityComponentsService } from '../../entity-components.service';
import {
  entityComponentsMock,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
} from '../../entity-components-mock.test-helpers';
import {
  COMPETITION_GROUPS_LIST_NO_DATA_MESSAGE,
  COMPETITION_GROUPS_LIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { ListDescriptionService } from '../shared/list-description.service';
import { CompetitionGroupsListService } from './competition-groups-list.service';
import { expectTimeoutFallback } from './toplist.test-helpers';

type CompetitionGroupRow = {
  id: number;
  name: string;
  leagueName: string;
  competitionCount: number;
};

let databaseTimeout: MockProxy<DatabaseTimeoutService>;

beforeEach(() => {
  databaseTimeout = mockDatabaseTimeout();
  // Tests that need the timeout branch override this per-call.
});

async function realListDescription(): Promise<ListDescriptionService> {
  const moduleRef = await Test.createTestingModule({
    providers: [ListDescriptionService],
  }).compile();
  return moduleRef.get(ListDescriptionService);
}

async function makeServiceFromCompetitionGroups(
  competitionGroups: CompetitionGroupsService,
  entityComponents: MockProxy<EntityComponentsService> = passthroughEntityComponents(),
): Promise<CompetitionGroupsListService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      CompetitionGroupsListService,
      { provide: CompetitionGroupsService, useValue: competitionGroups },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      {
        provide: ListDescriptionService,
        // Pure, dependency-free formatter — its own truncation rules are
        // covered by list-description.service.spec.ts.
        useValue: await realListDescription(),
      },
    ],
  }).compile();
  return moduleRef.get(CompetitionGroupsListService);
}

async function makeService(
  rows: CompetitionGroupRow[],
  entityComponents?: MockProxy<EntityComponentsService>,
): Promise<CompetitionGroupsListService> {
  const competitionGroups = mock<CompetitionGroupsService>();
  competitionGroups.listAllWithLeagueAndCount.mockResolvedValue(rows);
  return makeServiceFromCompetitionGroups(competitionGroups, entityComponents);
}

describe('CompetitionGroupsListService.resolve', () => {
  it('returns the empty-state embed when there are no competition groups', async () => {
    const result = await (await makeService([])).resolve(FACT_SCOPE_ALL_TIME);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Competition groups',
          description: COMPETITION_GROUPS_LIST_NO_DATA_MESSAGE,
        },
      ],
    });
  });

  it('renders a single group with its league, plural competition count, and a deepdive button', async () => {
    const service = await makeService([
      { id: 1, name: 'Chaos Cup', leagueName: 'Premier', competitionCount: 3 },
    ]);
    const result = await service.resolve(FACT_SCOPE_ALL_TIME);
    expect(result).toEqual({
      embeds: [
        {
          title: 'Competition groups',
          description: 'Chaos Cup (Premier): 3 competitions',
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
              label: 'Chaos Cup',
              custom_id: `${COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX}1`,
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('renders the singular "1 competition" for a group with exactly one competition', async () => {
    const service = await makeService([
      {
        id: 1,
        name: 'Ogretoberfest',
        leagueName: 'Premier',
        competitionCount: 1,
      },
    ]);
    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toBe(
      'Ogretoberfest (Premier): 1 competition',
    );
  });

  it('renders "0 competitions" for a group with no competitions yet', async () => {
    const service = await makeService([
      { id: 1, name: 'New Cup', leagueName: 'Premier', competitionCount: 0 },
    ]);
    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toBe(
      'New Cup (Premier): 0 competitions',
    );
  });

  it('lists all groups ordered by league, then group name', async () => {
    const service = await makeService([
      // deliberately scrambled input order
      { id: 4, name: 'B Cup', leagueName: 'B League', competitionCount: 2 },
      { id: 1, name: 'A Season', leagueName: 'A League', competitionCount: 5 },
      { id: 3, name: 'B Season', leagueName: 'A League', competitionCount: 1 },
      { id: 2, name: 'A Cup', leagueName: 'A League', competitionCount: 0 },
    ]);
    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toBe(
      [
        // A League groups first, alphabetical by group name within it
        'A Cup (A League): 0 competitions',
        'A Season (A League): 5 competitions',
        'B Season (A League): 1 competition',
        // then B League
        'B Cup (B League): 2 competitions',
      ].join('\n'),
    );
  });

  it('falls back to the stunned message when the competition groups query times out', async () => {
    // The real timeout race is DatabaseTimeoutService's own responsibility
    // (covered by database-timeout.service.spec.ts); here databaseTimeout is a
    // mock, so this stubs its timeout branch directly rather than waiting on a
    // real timer.
    stubDatabaseTimeoutOnce(databaseTimeout);
    await expectTimeoutFallback(
      async (competitionGroups: CompetitionGroupsService) =>
        (await makeServiceFromCompetitionGroups(competitionGroups)).resolve(
          FACT_SCOPE_ALL_TIME,
        ),
      () => {
        const competitionGroups = mock<CompetitionGroupsService>();
        competitionGroups.listAllWithLeagueAndCount.mockReturnValue(
          new Promise(() => {}),
        );
        return competitionGroups;
      },
      COMPETITION_GROUPS_LIST_TIMEOUT_MESSAGE,
    );
  });

  // The underlying cap/chunk/select logic is exercised in
  // entity-components.service.spec.ts. Here we only assert that
  // CompetitionGroupsListService hands EntityComponentsService one entry per
  // group, in the same order used for the embed text.
  it('hands one entry per group to EntityComponentsService, in display order', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: null,
    });
    const service = await makeService(
      [
        { id: 2, name: 'Second', leagueName: 'tLoEG', competitionCount: 1 },
        { id: 1, name: 'First', leagueName: 'tLoEG', competitionCount: 2 },
      ],
      entityComponents,
    );
    await service.resolve(FACT_SCOPE_ALL_TIME);
    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'First',
      },
      {
        customIdPrefix: COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '2',
        label: 'Second',
      },
    ]);
  });

  it('appends the overflow note when some groups got no link', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more without a link.',
    });
    const service = await makeService(
      [
        {
          id: 1,
          name: 'Chaos Cup',
          leagueName: 'Premier',
          competitionCount: 3,
        },
      ],
      entityComponents,
    );
    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toBe(
      'Chaos Cup (Premier): 3 competitions\n…and 3 more without a link.',
    );
  });

  it('passes the league scope through to the query', async () => {
    const competitionGroups = mock<CompetitionGroupsService>();
    competitionGroups.listAllWithLeagueAndCount.mockResolvedValue([]);
    const service = await makeServiceFromCompetitionGroups(competitionGroups);
    const scope: FactScope = { leagueId: 7 };
    await service.resolve(scope);
    expect(competitionGroups.listAllWithLeagueAndCount).toHaveBeenCalledWith(
      scope,
    );
  });

  it('truncates the description to the Discord embed cap when the group catalog is large', async () => {
    // Same bug shape as eras.list and trophies.list: an unbounded join of
    // every catalog row can pass Discord's 4096-char description cap, which
    // rejects the whole interaction rather than just the field.
    const rows: CompetitionGroupRow[] = Array.from(
      { length: 200 },
      (_unused, index) => ({
        id: index,
        name: `Competition Group Number ${index} With A Fairly Long Name`,
        leagueName: 'The Rather Long League Name',
        competitionCount: 3,
      }),
    );
    const service = await makeService(rows);

    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };

    const description = result.embeds[0].description;
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });

  it('keeps the overflow note in full when the group list must be truncated to fit', async () => {
    const entityComponents = entityComponentsMock();
    const overflowNote = '…and 12345 more without a link.';
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote,
    });
    const rows: CompetitionGroupRow[] = Array.from(
      { length: 200 },
      (_unused, index) => ({
        id: index,
        name: `Competition Group Number ${index} With A Fairly Long Name`,
        leagueName: 'The Rather Long League Name',
        competitionCount: 3,
      }),
    );
    const service = await makeService(rows, entityComponents);

    const result = (await service.resolve(FACT_SCOPE_ALL_TIME)) as {
      embeds: { description: string }[];
    };

    const description = result.embeds[0].description;
    expect(description.endsWith(`\n${overflowNote}`)).toBe(true);
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
  });
});

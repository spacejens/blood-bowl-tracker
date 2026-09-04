import type { RacePosition } from '@blood-bowl-tracker/game-data';
import { RacesService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DatabaseTimeoutService } from '../../database-timeout.service';
import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { EntityComponentsService } from '../../entity-components.service';
import {
  entityComponentsMock,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
  stubEntityEmoji,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_NO_TEAMS_MESSAGE,
  DEEPDIVE_RACE_NOT_FOUND_MESSAGE,
  DEEPDIVE_RACE_POSITIONS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_TEAM_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE,
  DEEPDIVE_RACE_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { passthroughLeaderboard } from '../../insights/leaderboard-mock.test-helpers';
import { TeamContextService } from '../../insights/team-context.service';
import { passthroughTeamContext } from '../../insights/team-context-mock.test-helpers';
import { EraSectionGrouperService } from '../../shared/era-section-grouper.service';
import {
  cannedEraSectionGrouper,
  singleEraSectionGrouper,
} from '../../shared/era-section-grouper-mock.test-helpers';
import {
  POSITION_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { RaceDeepdiveService } from './race-deepdive.service';

interface MakeServiceOptions {
  races: RacesService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  leaderboard?: MockProxy<LeaderboardService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  teamContext?: MockProxy<TeamContextService>;
  eraSectionGrouper?: MockProxy<EraSectionGrouperService>;
}

async function makeService({
  races,
  databaseTimeout = mockDatabaseTimeout(),
  leaderboard = mock<LeaderboardService>(),
  entityComponents = passthroughEntityComponents(),
  teamContext = passthroughTeamContext(),
  eraSectionGrouper = singleEraSectionGrouper(),
}: MakeServiceOptions): Promise<{
  service: RaceDeepdiveService;
  leaderboard: MockProxy<LeaderboardService>;
  entityComponents: MockProxy<EntityComponentsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      RaceDeepdiveService,
      { provide: RacesService, useValue: races },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: TeamContextService, useValue: teamContext },
      { provide: EraSectionGrouperService, useValue: eraSectionGrouper },
    ],
  }).compile();
  return {
    service: moduleRef.get(RaceDeepdiveService),
    leaderboard,
    entityComponents,
  };
}

function makeRaces(options: {
  race?: { id: number; name: string };
  eras?: { id: number; name: string }[];
  topTeams?: { id: number; name: string; count: number }[];
  positions?: RacePosition[];
}): MockProxy<RacesService> {
  const races = mock<RacesService>();
  races.findById.mockResolvedValue(options.race);
  races.listEras.mockResolvedValue(options.eras ?? []);
  races.getTopTeamsByMatchesPlayed.mockResolvedValue(options.topTeams ?? []);
  races.listPositionsByEra.mockResolvedValue(options.positions ?? []);
  return races;
}

describe('RaceDeepdiveService', () => {
  it('returns the not-found message when the race does not exist', async () => {
    const { service } = await makeService({
      races: makeRaces({ race: undefined }),
    });
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_RACE_NOT_FOUND_MESSAGE);
  });

  // LeaderboardService.topRanksWithTies (ranking, tie handling) is covered by
  // leaderboard.service.spec.ts. `passthroughLeaderboard()` cans it to simply
  // echo its inputs, and `passthroughEntityComponents()` cans component
  // building the same way, so this test asserts only what RaceDeepdiveService
  // itself owns: joining the eras/career lines, and building the
  // team-then-era component-entry pool (in that order — leaderboard entries
  // take component priority over header entries) that it hands to
  // buildEntityComponents.
  it('renders the eras list and top-teams list, with team components before era components', async () => {
    const leaderboard = passthroughLeaderboard();
    const { service } = await makeService({
      races: makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [
          { id: 3, name: 'BB2016' },
          { id: 4, name: 'BB2020' },
        ],
        topTeams: [
          { id: 9, name: 'Gouged Eye', count: 40 },
          { id: 10, name: 'Da Deff Skwad', count: 12 },
        ],
      }),
      leaderboard,
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: `${stubEntityEmoji(RACE_BUTTON_CUSTOM_ID_PREFIX)} Orc`,
          description: [
            'Eras: BB2016, BB2020',
            '',
            'Top teams by matches played:',
            '1. Gouged Eye — 40',
            '1. Da Deff Skwad — 12',
          ].join('\n'),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Gouged Eye',
              custom_id: 'deepdive:team:9',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Da Deff Skwad',
              custom_id: 'deepdive:team:10',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'BB2016',
              custom_id: 'deepdive:era:3',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'BB2020',
              custom_id: 'deepdive:era:4',
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('shows "None recorded" when the race is linked to no eras', async () => {
    const { service } = await makeService({
      races: makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [],
        topTeams: [{ id: 9, name: 'Gouged Eye', count: 40 }],
      }),
      leaderboard: passthroughLeaderboard(),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')[0]).toBe(
      'Eras: None recorded',
    );
  });

  it('shows the no-teams placeholder when the race has no top teams', async () => {
    const { service } = await makeService({
      races: makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [{ id: 4, name: 'BB2020' }],
        topTeams: [],
      }),
      leaderboard: passthroughLeaderboard(),
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: `${stubEntityEmoji(RACE_BUTTON_CUSTOM_ID_PREFIX)} Orc`,
          description: [
            'Eras: BB2020',
            '',
            'Top teams by matches played:',
            DEEPDIVE_RACE_NO_TEAMS_MESSAGE,
          ].join('\n'),
        },
      ],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'BB2020',
              custom_id: 'deepdive:era:4',
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('appends a truncation note when the ranked rows report a truncated count', async () => {
    const leaderboard = mock<LeaderboardService>();
    const rankedTeams = [{ id: 1, name: 'A', count: 9, rank: 1 }];
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: rankedTeams,
      truncatedCount: 4,
      tieGroupOpenEnded: false,
    });
    const { service } = await makeService({
      races: makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [{ id: 4, name: 'BB2020' }],
        topTeams: [{ id: 1, name: 'A', count: 9 }],
      }),
      leaderboard,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 4 more tied.');
  });

  it('appends the overflow note when components report entries without a link', async () => {
    const leaderboard = passthroughLeaderboard();
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 6 more without a link.',
    });
    const { service } = await makeService({
      races: makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [{ id: 4, name: 'BB2020' }],
        topTeams: [{ id: 1, name: 'A', count: 9 }],
      }),
      leaderboard,
      entityComponents,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 6 more without a link.');
  });

  it('omits components when the race has no eras and no teams', async () => {
    const { service } = await makeService({
      races: makeRaces({
        race: { id: 7, name: 'Orc' },
        eras: [],
        topTeams: [],
      }),
      leaderboard: passthroughLeaderboard(),
    });
    const result = await service.resolve(7);
    expect(result).not.toHaveProperty('components');
  });

  it('falls back to the race timeout message when the race lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          races: makeRaces({}),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_RACE_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the eras timeout message when the era-names lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run.mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          races: makeRaces({ race: { id: 1, name: 'Orc' } }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the teams timeout message when the top-teams lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          races: makeRaces({
            race: { id: 1, name: 'Orc' },
            eras: [{ id: 4, name: 'BB2020' }],
          }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE,
    );
  });

  it('appends each team coach to its line and leaves the race out', async () => {
    const teamContext = mock<TeamContextService>();
    const decorated: {
      id: number;
      name: string;
      count: number;
      rank: number;
      contextSuffix: string;
    }[] = [
      {
        id: 9,
        name: 'Gouged Eye',
        count: 40,
        rank: 1,
        contextSuffix: ' (Skarsnik)',
      },
      {
        id: 10,
        name: 'Da Deff Skwad',
        count: 12,
        rank: 1,
        contextSuffix: ' (Grashnak)',
      },
    ];
    teamContext.attachSuffixes.mockResolvedValue(decorated);
    const { service } = await makeService({
      races: makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [{ id: 4, name: 'BB2020' }],
        topTeams: [
          { id: 9, name: 'Gouged Eye', count: 40 },
          { id: 10, name: 'Da Deff Skwad', count: 12 },
        ],
      }),
      leaderboard: passthroughLeaderboard(),
      teamContext,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('1. Gouged Eye (Skarsnik) — 40');
    expect(lines).toContain('1. Da Deff Skwad (Grashnak) — 12');
    const [rows, teamIdOf, options] = teamContext.attachSuffixes.mock.calls[0];
    expect(teamIdOf(rows[0])).toBe(9);
    expect(options).toEqual({ includeRace: false, includeCoach: true });
  });

  it('keeps the no-teams placeholder free of any context suffix', async () => {
    const { service } = await makeService({
      races: makeRaces({
        race: { id: 1, name: 'Orc' },
        eras: [{ id: 4, name: 'BB2020' }],
        topTeams: [],
      }),
      leaderboard: passthroughLeaderboard(),
      teamContext: passthroughTeamContext(' (Skarsnik)'),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain(DEEPDIVE_RACE_NO_TEAMS_MESSAGE);
  });

  it('falls back to the team-context timeout message when attachSuffixes times out', async () => {
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
          races: makeRaces({
            race: { id: 1, name: 'Orc' },
            eras: [{ id: 4, name: 'BB2020' }],
            topTeams: [{ id: 9, name: 'Gouged Eye', count: 40 }],
          }),
          leaderboard: passthroughLeaderboard(),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_RACE_TEAM_CONTEXT_TIMEOUT_MESSAGE,
    );
  });

  it('lists the positions available in each era, one heading per era and one row per position', async () => {
    const positions: RacePosition[] = [
      { id: 1, name: 'Blitzer', eraId: 3, eraName: 'BB2016' },
      { id: 2, name: 'Lineman', eraId: 3, eraName: 'BB2016' },
      { id: 2, name: 'Lineman', eraId: 4, eraName: 'BB2020' },
    ];
    const { service, entityComponents } = await makeService({
      races: makeRaces({
        race: { id: 1, name: 'Orc' },
        positions,
      }),
      leaderboard: passthroughLeaderboard(),
      // Mirrors the trophy/competition-group deep dives' own per-era section
      // rendering: one heading per era, then one row per item under it —
      // not the single packed line per era this section used to render.
      eraSectionGrouper: cannedEraSectionGrouper([
        { eraName: 'BB2016', rows: positions.slice(0, 2) },
        { eraName: 'BB2020', rows: positions.slice(2) },
      ]),
    });

    const result = await service.resolve(1);

    expect(JSON.stringify(result)).toContain(
      'BB2016 positions:\\nBlitzer\\nLineman\\n\\nBB2020 positions:\\nLineman',
    );
    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          customIdPrefix: POSITION_BUTTON_CUSTOM_ID_PREFIX,
          entityId: '1',
          label: 'Blitzer',
        },
        {
          customIdPrefix: POSITION_BUTTON_CUSTOM_ID_PREFIX,
          entityId: '2',
          label: 'Lineman',
        },
      ]),
    );
  });

  it('omits the positions section entirely when the race has none recorded', async () => {
    const { service } = await makeService({
      races: makeRaces({ race: { id: 1, name: 'Orc' }, positions: [] }),
      leaderboard: passthroughLeaderboard(),
    });

    expect(JSON.stringify(await service.resolve(1))).not.toContain(
      'positions:',
    );
  });

  it('returns the positions timeout message when that query times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    databaseTimeout.run
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (work) => work)
      .mockImplementationOnce(async (_work, fallback) => fallback);
    const { service } = await makeService({
      races: makeRaces({ race: { id: 1, name: 'Orc' } }),
      databaseTimeout,
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_RACE_POSITIONS_TIMEOUT_MESSAGE,
    );
  });

  it('truncates the description to the Discord embed cap when a race has an unbounded number of positions', async () => {
    // listPositionsByEra carries no row cap, so a race with many eras and
    // many positions per era can produce a description longer than Discord's
    // MAX_DESCRIPTION_LENGTH. 600 one-per-line position names comfortably
    // exceeds it.
    const manyPositions: RacePosition[] = Array.from(
      { length: 600 },
      (_unused, index) => ({
        id: index,
        name: `Position ${index}`,
        eraId: 3,
        eraName: 'BB2016',
      }),
    );
    const { service } = await makeService({
      races: makeRaces({
        race: { id: 1, name: 'Orc' },
        positions: manyPositions,
      }),
      leaderboard: passthroughLeaderboard(),
    });

    const result = await service.resolve(1);

    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });
});

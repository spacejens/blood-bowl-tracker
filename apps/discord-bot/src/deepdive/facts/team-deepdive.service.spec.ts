import type { TeamHonor } from '@blood-bowl-tracker/game-data';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import {
  entityComponentsMock,
  STUB_BUTTON_EMOJI,
  stubEntityEmoji,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_ERAS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { passthroughLeaderboard } from '../../insights/leaderboard-mock.test-helpers';
import { PlayerContextService } from '../../insights/player-context.service';
import { passthroughPlayerContext } from '../../insights/player-context-mock.test-helpers';
import {
  cannedEraSectionGrouper,
  singleEraSectionGrouper,
} from '../../shared/era-section-grouper-mock.test-helpers';
import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../button-custom-ids';
import {
  grinders,
  makeService,
  makeTeams,
  makeTrophyAwards,
  mvp,
  spikeCup,
} from './team-deepdive.test-helpers';

describe('TeamDeepdiveService', () => {
  it('returns the not-found message when the team does not exist', async () => {
    const { service } = await makeService({
      teams: makeTeams({ team: undefined }),
    });
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_TEAM_NOT_FOUND_MESSAGE);
  });

  // LeaderboardService.topRanksWithTies (ranking, tie handling) is covered by
  // leaderboard.service.spec.ts. `passthroughLeaderboard()` cans it to simply
  // echo its inputs, and `passthroughEntityComponents()` cans component
  // building the same way, so this test asserts only what TeamDeepdiveService
  // itself owns: joining the race/coach/eras/career/ranked-row lines, and
  // building the player-then-race-then-coach-then-era component-entry pool
  // (in that order — leaderboard entries take component priority over header
  // entries) that it hands to buildEntityComponents.
  it('renders the race, coach, career span and top-players list, with player components before header components', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [
          {
            playerId: 5,
            name: 'Griff',
            count: 20,
            positionId: 60,
            positionName: 'Blitzer',
            isStarPlayer: false,
          },
          {
            playerId: 8,
            name: 'Morg',
            count: 11,
            positionId: 61,
            positionName: 'Morg N Thorg',
            isStarPlayer: true,
          },
        ],
      }),
      leaderboard: passthroughLeaderboard(),
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: `${stubEntityEmoji(TEAM_BUTTON_CUSTOM_ID_PREFIX)} 40 grinders`,
          description: [
            'Race: Dwarf',
            'Coach: Roze Madder',
            'Eras: None recorded',
            'Career: 2021-09-01 – 2023-06-10',
            '',
            'Top players by match events:',
            '1. Griff — 20',
            '1. Morg — 11',
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
              label: 'Griff',
              custom_id: 'deepdive:player:5',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Morg',
              custom_id: 'deepdive:player:8',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Dwarf',
              custom_id: 'deepdive:race:4',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Roze Madder',
              custom_id: 'deepdive:coach:12',
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
  });

  it('renders the eras line after the coach line, with era buttons after the player buttons', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        eras: [
          { id: 3, name: 'BB2016' },
          { id: 4, name: 'BB2020' },
        ],
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [
          {
            playerId: 5,
            name: 'Griff',
            count: 20,
            positionId: 60,
            positionName: 'Blitzer',
            isStarPlayer: false,
          },
        ],
      }),
      leaderboard: passthroughLeaderboard(),
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: `${stubEntityEmoji(TEAM_BUTTON_CUSTOM_ID_PREFIX)} 40 grinders`,
          description: [
            'Race: Dwarf',
            'Coach: Roze Madder',
            'Eras: BB2016, BB2020',
            'Career: 2021-09-01 – 2023-06-10',
            '',
            'Top players by match events:',
            '1. Griff — 20',
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
              label: 'Griff',
              custom_id: 'deepdive:player:5',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Dwarf',
              custom_id: 'deepdive:race:4',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Roze Madder',
              custom_id: 'deepdive:coach:12',
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

  it('shows "None recorded" when the team is linked to no eras', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        eras: [],
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [
          {
            playerId: 5,
            name: 'Griff',
            count: 20,
            positionId: 60,
            positionName: 'Blitzer',
            isStarPlayer: false,
          },
        ],
      }),
      leaderboard: passthroughLeaderboard(),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')[2]).toBe(
      'Eras: None recorded',
    );
  });

  it('renders the eras line and era buttons on the no-matches path too', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        eras: [{ id: 4, name: 'BB2020' }],
        span: undefined,
      }),
      leaderboard: passthroughLeaderboard(),
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: `${stubEntityEmoji(TEAM_BUTTON_CUSTOM_ID_PREFIX)} 40 grinders`,
          description: [
            'Race: Dwarf',
            'Coach: Roze Madder',
            'Eras: BB2020',
            DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
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
              label: 'Dwarf',
              custom_id: 'deepdive:race:4',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Roze Madder',
              custom_id: 'deepdive:coach:12',
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

  it('appends a truncation note when the ranked rows report a truncated count', async () => {
    const leaderboard = mock<LeaderboardService>();
    const rankedPlayers = [{ playerId: 1, name: 'P0', count: 9, rank: 1 }];
    leaderboard.topRanksWithTies.mockReturnValue({
      rows: rankedPlayers,
      truncatedCount: 2,
      tieGroupOpenEnded: false,
    });
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [
          {
            playerId: 1,
            name: 'P0',
            count: 9,
            positionId: 61,
            positionName: 'Catcher',
            isStarPlayer: false,
          },
        ],
      }),
      leaderboard,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 2 more tied.');
  });

  it('appends the overflow note when components report entries without a link', async () => {
    const leaderboard = passthroughLeaderboard();
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 5 more without a link.',
    });
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [
          {
            playerId: 1,
            name: 'P0',
            count: 9,
            positionId: 61,
            positionName: 'Catcher',
            isStarPlayer: false,
          },
        ],
      }),
      leaderboard,
      entityComponents,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('…and 5 more without a link.');
  });

  it('shows race, coach and the no-matches message, skipping the top-players section, but still renders race/coach components', async () => {
    const teams = makeTeams({ team: grinders, span: undefined });
    const { service } = await makeService({
      teams,
      leaderboard: passthroughLeaderboard(),
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: `${stubEntityEmoji(TEAM_BUTTON_CUSTOM_ID_PREFIX)} 40 grinders`,
          description: [
            'Race: Dwarf',
            'Coach: Roze Madder',
            'Eras: None recorded',
            DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
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
              label: 'Dwarf',
              custom_id: 'deepdive:race:4',
              emoji: STUB_BUTTON_EMOJI,
            },
            {
              type: 2,
              style: 1,
              label: 'Roze Madder',
              custom_id: 'deepdive:coach:12',
              emoji: STUB_BUTTON_EMOJI,
            },
          ],
        },
      ],
    });
    expect(teams.getTopPlayersByMatchEventCount).not.toHaveBeenCalled();
  });

  // The no-matches early return builds its own components (header-only, since
  // no leaderboard data has been fetched yet) and threads the overflow note
  // into the description. The shared entity-components stubs hardcode
  // `overflowNote: null`, so this branch needs a per-test override to be
  // exercised with a note present.
  it('appends the overflow note on the no-matches path', async () => {
    const entityComponents = entityComponentsMock();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 4 more without a link.',
    });
    const { service } = await makeService({
      teams: makeTeams({ team: grinders, span: undefined }),
      entityComponents,
    });
    const result = await service.resolve(1);
    expect(result).toEqual({
      embeds: [
        {
          title: `${stubEntityEmoji(TEAM_BUTTON_CUSTOM_ID_PREFIX)} 40 grinders`,
          description: [
            'Race: Dwarf',
            'Coach: Roze Madder',
            'Eras: None recorded',
            DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
            '…and 4 more without a link.',
          ].join('\n'),
        },
      ],
      components: [],
    });
  });

  it('falls back to the team timeout message when the team lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          teams: makeTeams({}),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the eras timeout message when the era lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run.mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          teams: makeTeams({ team: grinders }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_ERAS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the career timeout message when the span lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          teams: makeTeams({ team: grinders }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the players timeout message when the top-players lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          teams: makeTeams({
            team: grinders,
            span: { start: '2021-09-01', end: '2023-06-10' },
          }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
    );
  });

  it('still renders race and coach components when the team has no matches', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: {
          id: 1,
          name: 'Reikland Reavers',
          raceName: 'Human',
          raceId: 2,
          coachName: 'Roze',
          coachId: 9,
        },
        span: undefined,
      }),
      leaderboard: passthroughLeaderboard(),
    });
    const result = (await service.resolve(1)) as unknown as {
      components: { components: { label: string; custom_id: string }[] }[];
    };
    const buttons = result.components.flatMap((row) => row.components);
    expect(buttons.map((b) => b.custom_id)).toEqual([
      'deepdive:race:2',
      'deepdive:coach:9',
    ]);
  });

  it('appends each player position and era to its line, leaving team, race and coach out', async () => {
    const playerContext = mock<PlayerContextService>();
    const decorated: {
      playerId: number;
      name: string;
      count: number;
      contextSuffix: string;
    }[] = [
      {
        playerId: 5,
        name: 'Griff',
        count: 20,
        contextSuffix: ' (Blitzer, First era)',
      },
      {
        playerId: 8,
        name: 'Morg',
        count: 11,
        contextSuffix: ' (Star Player, Second era)',
      },
    ];
    playerContext.attachSuffixes.mockResolvedValue(decorated);
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [
          {
            playerId: 5,
            name: 'Griff',
            count: 20,
            positionId: 60,
            positionName: 'Blitzer',
            isStarPlayer: false,
          },
          {
            playerId: 8,
            name: 'Morg',
            count: 11,
            positionId: 61,
            positionName: 'Morg N Thorg',
            isStarPlayer: true,
          },
        ],
      }),
      leaderboard: passthroughLeaderboard(),
      playerContext,
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('1. Griff (Blitzer, First era) — 20');
    expect(lines).toContain('1. Morg (Star Player, Second era) — 11');
    const [rows, playerIdOf, options] =
      playerContext.attachSuffixes.mock.calls[0];
    expect(playerIdOf(rows[0])).toBe(5);
    expect(options).toEqual({
      includePosition: true,
      includeTeam: false,
      includeRace: false,
      includeEra: true,
      includeCoach: false,
    });
  });

  it('falls back to the player-context timeout message when attachSuffixes times out', async () => {
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
          teams: makeTeams({
            team: grinders,
            span: { start: '2021-09-01', end: '2023-06-10' },
            topPlayers: [
              {
                playerId: 5,
                name: 'Griff',
                count: 20,
                positionId: 60,
                positionName: 'Blitzer',
                isStarPlayer: false,
              },
            ],
          }),
          leaderboard: passthroughLeaderboard(),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
    );
  });

  it('renders a team honor as "<competition> (<trophy>)" under its era heading', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
        topPlayers: [
          {
            playerId: 5,
            name: 'Griff',
            count: 20,
            positionId: 60,
            positionName: 'Blitzer',
            isStarPlayer: false,
          },
        ],
      }),
      leaderboard: passthroughLeaderboard(),
      trophyAwards: makeTrophyAwards([spikeCup]),
      eraSectionGrouper: singleEraSectionGrouper('Season 4'),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')).toEqual([
      'Race: Dwarf',
      'Coach: Roze Madder',
      'Eras: None recorded',
      'Career: 2021-09-01 – 2023-06-10',
      '',
      'Season 4 trophies:',
      'Season 4 Major (Spike! Cup)',
      '',
      'Top players by match events:',
      '1. Griff — 20',
    ]);
  });

  it('renders a player honor as "<competition> (<trophy>): <player><position suffix>"', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
      }),
      leaderboard: passthroughLeaderboard(),
      playerContext: passthroughPlayerContext(' (Blitzer)'),
      trophyAwards: makeTrophyAwards([mvp]),
      eraSectionGrouper: singleEraSectionGrouper('Season 4'),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')).toContain(
      'Season 4 Minor (MVP): Grombrindal (Blitzer)',
    );
  });

  it('asks for the player position only, leaving team, race, era and coach off honor rows', async () => {
    const playerContext = passthroughPlayerContext();
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
      }),
      leaderboard: passthroughLeaderboard(),
      playerContext,
      trophyAwards: makeTrophyAwards([mvp]),
    });
    await service.resolve(1);
    // Call 0 is the top-players decoration; call 1 is the honors decoration.
    const [rows, playerIdOf, options] =
      playerContext.attachSuffixes.mock.calls[1];
    expect(playerIdOf(rows[0])).toBe(55);
    expect(options).toEqual({
      includePosition: true,
      includeTeam: false,
      includeRace: false,
      includeEra: false,
      includeCoach: false,
    });
  });

  it('interleaves team and player honors inside one era section, in query order', async () => {
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
      }),
      leaderboard: passthroughLeaderboard(),
      trophyAwards: makeTrophyAwards([spikeCup, mvp]),
      eraSectionGrouper: singleEraSectionGrouper('Season 4'),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    const start = lines.indexOf('Season 4 trophies:');
    expect(lines.slice(start, start + 3)).toEqual([
      'Season 4 trophies:',
      'Season 4 Major (Spike! Cup)',
      'Season 4 Minor (MVP): Grombrindal',
    ]);
  });

  it('heads one section per era, separated by a blank line, newest era first', async () => {
    const older: TeamHonor = {
      ...spikeCup,
      eraId: 18,
      eraName: 'Season 2',
      competitionName: 'Season 2 Major',
      competitionStartDate: '2022-01-15',
    };
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
      }),
      leaderboard: passthroughLeaderboard(),
      trophyAwards: makeTrophyAwards([spikeCup, older]),
      eraSectionGrouper: cannedEraSectionGrouper([
        { eraName: 'Season 4', rows: [spikeCup] },
        { eraName: 'Season 2', rows: [older] },
      ]),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    const start = lines.indexOf('Season 4 trophies:');
    expect(lines.slice(start, start + 5)).toEqual([
      'Season 4 trophies:',
      'Season 4 Major (Spike! Cup)',
      '',
      'Season 2 trophies:',
      'Season 2 Major (Spike! Cup)',
    ]);
  });

  it('omits the trophies section entirely when the team has won nothing', async () => {
    const { service, trophyAwards } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
      }),
      leaderboard: passthroughLeaderboard(),
      trophyAwards: makeTrophyAwards([], 0),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')).toEqual([
      'Race: Dwarf',
      'Coach: Roze Madder',
      'Eras: None recorded',
      'Career: 2021-09-01 – 2023-06-10',
      '',
      'Top players by match events:',
    ]);
    // A confirmed zero total means there is nothing left to list, so the list
    // query is never issued.
    expect(trophyAwards.listByTeam).not.toHaveBeenCalled();
  });

  it('omits the trophies section when the count is stale but the list comes back empty', async () => {
    // A nonzero countByTeam paired with a zero-row listByTeam can happen if an
    // award is deleted between the two queries; the section must key off the
    // rows actually returned, not the (now stale) total.
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
      }),
      leaderboard: passthroughLeaderboard(),
      trophyAwards: makeTrophyAwards([], 5),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines.some((line) => line.includes('trophies:'))).toBe(false);
    // The section is skipped entirely; an overflow note alongside no section
    // would contradict that, even though `honorsTotal` is still (stalely)
    // nonzero.
    expect(lines.some((line) => line.includes('more not shown.'))).toBe(false);
  });

  it('caps the honors list and appends an exact remainder note when there are more', async () => {
    const { service, trophyAwards } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
      }),
      leaderboard: passthroughLeaderboard(),
      trophyAwards: makeTrophyAwards([spikeCup], 34),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(trophyAwards.listByTeam).toHaveBeenCalledWith(1, 30);
    expect(result.embeds[0].description.split('\n')).toContain(
      '…and 33 more not shown.',
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import {
  DEEPDIVE_TEAM_HONORS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import { passthroughLeaderboard } from '../../insights/leaderboard-mock.test-helpers';
import { passthroughPlayerContext } from '../../insights/player-context-mock.test-helpers';
import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import {
  grinders,
  makePlayerRowButton,
  makeService,
  makeTeams,
  makeTrophyAwards,
  mvp,
  spikeCup,
} from './team-deepdive.test-helpers';

describe('TeamDeepdiveService buttons', () => {
  it('offers a trophy button for a team honor and trophy + player buttons for a player honor, before the header buttons', async () => {
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
      trophyAwards: makeTrophyAwards([spikeCup, mvp]),
    });
    const result = (await service.resolve(1)) as unknown as {
      components: { components: { label: string; custom_id: string }[] }[];
    };
    const buttons = result.components.flatMap((row) => row.components);
    expect(buttons.map((button) => button.custom_id)).toEqual([
      `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}7`,
      `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}9`,
      `${PLAYER_BUTTON_CUSTOM_ID_PREFIX}55`,
      `${PLAYER_BUTTON_CUSTOM_ID_PREFIX}5`,
      'deepdive:race:4',
      'deepdive:coach:12',
    ]);
    expect(buttons.map((button) => button.label)).toEqual([
      'Spike! Cup',
      'MVP',
      'Grombrindal',
      'Griff',
      'Dwarf',
      'Roze Madder',
    ]);
  });

  it('falls back to the honors timeout message when the honors count times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
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
          trophyAwards: makeTrophyAwards([spikeCup]),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_HONORS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the honors timeout message when the honors list times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
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
          trophyAwards: makeTrophyAwards([spikeCup]),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_HONORS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the player-context timeout message when decorating player honors times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work)
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
          trophyAwards: makeTrophyAwards([mvp]),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
    );
  });

  it('skips the honor-suffix lookup entirely when no honor is a player award', async () => {
    const playerContext = passthroughPlayerContext();
    const { service } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2021-09-01', end: '2023-06-10' },
      }),
      leaderboard: passthroughLeaderboard(),
      playerContext,
      trophyAwards: makeTrophyAwards([spikeCup]),
    });
    await service.resolve(1);
    // Only the top-players decoration ran.
    expect(playerContext.attachSuffixes).toHaveBeenCalledTimes(1);
  });

  it('asks PlayerRowButtonService for each top player row', async () => {
    const { service, playerRowButton } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2020', end: '2021' },
        topPlayers: [
          {
            playerId: 7,
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

    await service.resolve(1);

    expect(playerRowButton.buildPlayerRowButton).toHaveBeenCalledWith({
      playerId: 7,
      playerName: 'Griff',
      positionId: 60,
      positionName: 'Blitzer',
      isStarPlayer: false,
    });
  });

  it('shows the star player button for a star hire in the top players list', async () => {
    const playerRowButton = makePlayerRowButton();
    playerRowButton.buildPlayerRowButton.mockReturnValue({
      customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      entityId: '61',
      label: 'Morg N Thorg',
    });
    const { service, entityComponents } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2020', end: '2021' },
        topPlayers: [
          {
            playerId: 7,
            name: 'Morg N Thorg',
            count: 20,
            positionId: 61,
            positionName: 'Morg N Thorg',
            isStarPlayer: true,
          },
        ],
      }),
      leaderboard: passthroughLeaderboard(),
      playerRowButton,
    });

    await service.resolve(1);

    expect(
      entityComponents.buildEntityComponents.mock.calls[0][0],
    ).toContainEqual({
      customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      entityId: '61',
      label: 'Morg N Thorg',
    });
    expect(playerRowButton.buildPlayerRowButton).toHaveBeenCalledWith({
      playerId: 7,
      playerName: 'Morg N Thorg',
      positionId: 61,
      positionName: 'Morg N Thorg',
      isStarPlayer: true,
    });
  });

  it('shows the star player button for a star hire who won an honor', async () => {
    const playerRowButton = makePlayerRowButton();
    playerRowButton.buildPlayerRowButton.mockReturnValue({
      customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      entityId: '61',
      label: 'Morg N Thorg',
    });
    const { service, entityComponents } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2020', end: '2021' },
      }),
      trophyAwards: makeTrophyAwards([
        {
          trophyId: 2,
          trophyName: 'MVP',
          competitionName: 'Minor Season 23',
          competitionStartDate: '2023-01-15',
          eraId: 19,
          eraName: 'Season 2',
          playerId: 40,
          playerName: 'Morg N Thorg',
          playerPositionId: 61,
          playerPositionName: 'Morg N Thorg',
          playerIsStarPlayer: true,
        },
      ]),
      leaderboard: passthroughLeaderboard(),
      playerRowButton,
    });

    await service.resolve(1);

    expect(
      entityComponents.buildEntityComponents.mock.calls[0][0],
    ).toContainEqual({
      customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      entityId: '61',
      label: 'Morg N Thorg',
    });
  });

  it('asks PlayerRowButtonService for the player who won an honor', async () => {
    const { service, playerRowButton } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2020', end: '2021' },
      }),
      trophyAwards: makeTrophyAwards([
        {
          trophyId: 2,
          trophyName: 'MVP',
          competitionName: 'Minor Season 23',
          competitionStartDate: '2023-01-15',
          eraId: 19,
          eraName: 'Season 2',
          playerId: 40,
          playerName: 'Morg N Thorg',
          playerPositionId: 61,
          playerPositionName: 'Morg N Thorg',
          playerIsStarPlayer: true,
        },
      ]),
      leaderboard: passthroughLeaderboard(),
    });

    await service.resolve(1);

    expect(playerRowButton.buildPlayerRowButton).toHaveBeenCalledWith({
      playerId: 40,
      playerName: 'Morg N Thorg',
      positionId: 61,
      positionName: 'Morg N Thorg',
      isStarPlayer: true,
    });
  });

  it('never asks for a player button on a team-won honor', async () => {
    const { service, playerRowButton } = await makeService({
      teams: makeTeams({
        team: grinders,
        span: { start: '2020', end: '2021' },
      }),
      trophyAwards: makeTrophyAwards([
        {
          trophyId: 1,
          trophyName: 'Spike! Cup',
          competitionName: 'Major Season 24',
          competitionStartDate: '2024-01-15',
          eraId: 20,
          eraName: 'Season 4',
          playerId: null,
          playerName: null,
          playerPositionId: null,
          playerPositionName: null,
          playerIsStarPlayer: null,
        },
      ]),
      leaderboard: passthroughLeaderboard(),
    });

    await service.resolve(1);

    expect(playerRowButton.buildPlayerRowButton).not.toHaveBeenCalled();
  });
});

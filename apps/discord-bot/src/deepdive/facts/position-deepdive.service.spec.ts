import type {
  PositionCharacteristics,
  PositionHeader,
  PositionTopPlayer,
} from '@blood-bowl-tracker/game-data';
import {
  CharacteristicDisplayFormattingService,
  PositionRulesSetsService,
  PositionsService,
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
import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';
import { EntityComponentsService } from '../../entity-components.service';
import {
  passthroughEntityComponents,
  stubEntityEmoji,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_POSITION_CHARACTERISTICS_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_NO_CHARACTERISTICS_MESSAGE,
  DEEPDIVE_POSITION_NO_PLAYERS_MESSAGE,
  DEEPDIVE_POSITION_NOT_FOUND_MESSAGE,
  DEEPDIVE_POSITION_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_PLAYER_COUNT_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_TIMEOUT_MESSAGE,
  DEEPDIVE_POSITION_TOP_PLAYERS_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { LeaderboardService } from '../../insights/leaderboard.service';
import { passthroughLeaderboard } from '../../insights/leaderboard-mock.test-helpers';
import { PlayerContextService } from '../../insights/player-context.service';
import { passthroughPlayerContext } from '../../insights/player-context-mock.test-helpers';
import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  POSITION_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PositionDeepdiveService } from './position-deepdive.service';

const bb2016: PositionCharacteristics = {
  rulesSetId: 1,
  rulesSetName: 'BB2016',
  moveFormat: 'bare',
  move: 7,
  strengthFormat: 'bare',
  strength: 3,
  agilityFormat: 'bare',
  agility: 3,
  passingFormat: 'absent',
  passing: null,
  armourFormat: 'bare',
  armour: 8,
};

const bb2020: PositionCharacteristics = {
  rulesSetId: 2,
  rulesSetName: 'BB2020',
  moveFormat: 'bare',
  move: 7,
  strengthFormat: 'bare',
  strength: 3,
  agilityFormat: 'plus',
  agility: 3,
  passingFormat: 'plus',
  passing: 4,
  armourFormat: 'plus',
  armour: 9,
};

interface MakeServiceOptions {
  positions: PositionsService;
  positionRulesSets: PositionRulesSetsService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  leaderboard?: MockProxy<LeaderboardService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  playerContext?: MockProxy<PlayerContextService>;
}

async function makeService({
  positions,
  positionRulesSets,
  databaseTimeout = mockDatabaseTimeout(),
  leaderboard = passthroughLeaderboard(),
  entityComponents = passthroughEntityComponents(),
  playerContext = passthroughPlayerContext(),
}: MakeServiceOptions): Promise<{
  service: PositionDeepdiveService;
  leaderboard: MockProxy<LeaderboardService>;
  entityComponents: MockProxy<EntityComponentsService>;
  playerContext: MockProxy<PlayerContextService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionDeepdiveService,
      // Real: a pure, dependency-free formatting service, per CLAUDE.md's
      // carve-out. Mocking it would leave the rendered stat lines — the whole
      // point of this view — unasserted.
      CharacteristicDisplayFormattingService,
      { provide: PositionsService, useValue: positions },
      { provide: PositionRulesSetsService, useValue: positionRulesSets },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: PlayerContextService, useValue: playerContext },
    ],
  }).compile();
  return {
    service: moduleRef.get(PositionDeepdiveService),
    leaderboard,
    entityComponents,
    playerContext,
  };
}

function makePositions(options: {
  position?: PositionHeader;
  playerCount?: number;
  topPlayers?: PositionTopPlayer[];
}): MockProxy<PositionsService> {
  const positions = mock<PositionsService>();
  positions.findById.mockResolvedValue(options.position);
  positions.countPlayers.mockResolvedValue(options.playerCount ?? 0);
  positions.listTopPlayersBySpp.mockResolvedValue(options.topPlayers ?? []);
  return positions;
}

function makeRulesSets(
  rows: PositionCharacteristics[],
): MockProxy<PositionRulesSetsService> {
  const positionRulesSets = mock<PositionRulesSetsService>();
  positionRulesSets.listByPosition.mockResolvedValue(rows);
  return positionRulesSets;
}

/**
 * A `DatabaseTimeoutService` mock that passes the first `skip` calls through
 * and times the next one out, so a test can pin which of the five queries a
 * timeout message belongs to.
 */
function timeoutOnCall(skip: number): MockProxy<DatabaseTimeoutService> {
  const databaseTimeout = mockDatabaseTimeout();
  for (let index = 0; index < skip; index += 1) {
    databaseTimeout.run.mockImplementationOnce(async (work) => work);
  }
  stubDatabaseTimeoutOnce(databaseTimeout);
  return databaseTimeout;
}

describe('PositionDeepdiveService', () => {
  it('returns the not-found message when the position does not exist', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: undefined }),
      positionRulesSets: makeRulesSets([]),
    });

    await expect(service.resolve(999)).resolves.toBe(
      DEEPDIVE_POSITION_NOT_FOUND_MESSAGE,
    );
  });

  it('returns the timeout message when the position lookup times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([]),
      databaseTimeout: timeoutOnCall(0),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_TIMEOUT_MESSAGE,
    );
  });

  it('returns the characteristics timeout message when that query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(1),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_CHARACTERISTICS_TIMEOUT_MESSAGE,
    );
  });

  it('returns the player-count timeout message when that query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(2),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_PLAYER_COUNT_TIMEOUT_MESSAGE,
    );
  });

  it('returns the top-players timeout message when that query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({ position: { name: 'Blitzer', races: [] } }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(3),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_TOP_PLAYERS_TIMEOUT_MESSAGE,
    );
  });

  it('returns the player-context timeout message when that query times out', async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        topPlayers: [{ id: 9, name: 'Griff', sppTotal: 130 }],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(4),
    });

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_POSITION_PLAYER_CONTEXT_TIMEOUT_MESSAGE,
    );
  });

  it('skips the player-context lookup entirely when there are no top players', async () => {
    // attachSuffixes does its own DB round trip; with no ranked players to
    // decorate there is nothing for it to look up, so it must not run at
    // all — running it anyway would risk a spurious
    // DEEPDIVE_POSITION_PLAYER_CONTEXT_TIMEOUT_MESSAGE in place of the
    // correct "no players" view if that unnecessary call happened to time
    // out. Pin this by timing out the 5th call: if attachSuffixes were
    // still invoked, this would return the timeout message instead of
    // rendering normally.
    const { service, playerContext } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        playerCount: 0,
        topPlayers: [],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
      databaseTimeout: timeoutOnCall(4),
    });

    const rendered = JSON.stringify(await service.resolve(1));

    expect(rendered).toContain(DEEPDIVE_POSITION_NO_PLAYERS_MESSAGE);
    expect(playerContext.attachSuffixes).not.toHaveBeenCalled();
  });

  it('renders races, one stat line per rules set, the player count and the top players', async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: {
          name: 'Blitzer',
          races: [
            { id: 2, name: 'Human' },
            { id: 5, name: 'Orc' },
          ],
        },
        playerCount: 42,
        topPlayers: [
          { id: 9, name: 'Griff', sppTotal: 130 },
          { id: 10, name: 'Varag', sppTotal: 88 },
        ],
      }),
      positionRulesSets: makeRulesSets([bb2016, bb2020]),
    });

    const result = await service.resolve(1);

    // `passthroughLeaderboard()` stamps rank 1 on every row rather than
    // re-deriving ranks — the real ranking is covered by
    // leaderboard.service.spec.ts — so both rows read as "1." here.
    expect(result).toMatchObject({
      embeds: [
        {
          title: `${stubEntityEmoji(POSITION_BUTTON_CUSTOM_ID_PREFIX)} Blitzer`,
          description: [
            'Race(s): Human, Orc',
            '',
            'BB2016: MA 7 ST 3 AG 3 AV 8',
            'BB2020: MA 7 ST 3 AG 3+ PA 4+ AV 9+',
            '',
            'Held by 42 players',
            '',
            'Top players by SPP:',
            '1. Griff — 130',
            '1. Varag — 88',
          ].join('\n'),
        },
      ],
    });
  });

  it('omits the Passing field for a rules set that has no Passing characteristic', async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        playerCount: 1,
      }),
      positionRulesSets: makeRulesSets([bb2016]),
    });

    expect(JSON.stringify(await service.resolve(1))).not.toContain('PA ');
  });

  it('renders a not-yet-curated zero as a dash', async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        playerCount: 1,
      }),
      positionRulesSets: makeRulesSets([{ ...bb2020, move: 0 }]),
    });

    expect(JSON.stringify(await service.resolve(1))).toContain('MA —');
  });

  it('reports the empty cases rather than rendering blank sections', async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        playerCount: 0,
        topPlayers: [],
      }),
      positionRulesSets: makeRulesSets([]),
    });

    const rendered = JSON.stringify(await service.resolve(1));

    expect(rendered).toContain('Race(s): None recorded');
    expect(rendered).toContain(DEEPDIVE_POSITION_NO_CHARACTERISTICS_MESSAGE);
    expect(rendered).toContain('Held by 0 players');
    expect(rendered).toContain(DEEPDIVE_POSITION_NO_PLAYERS_MESSAGE);
  });

  it('uses the singular for a position held by exactly one player', async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        playerCount: 1,
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    expect(JSON.stringify(await service.resolve(1))).toContain(
      'Held by 1 player\\n',
    );
  });

  it('ranks top players by SPP total, not by player id or fetch order', async () => {
    const { service, leaderboard } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        topPlayers: [
          { id: 9, name: 'Griff', sppTotal: 130 },
          { id: 10, name: 'Varag', sppTotal: 88 },
        ],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    await service.resolve(1);

    // Asserted on the mocked call rather than a real LeaderboardService: it
    // injects DatabaseTimeoutService and EntityComponentsService, so it is
    // not the dependency-free kind of collaborator CLAUDE.md's real-provider
    // carve-out covers, and topRanksWithTies's own ranking/tie behavior
    // already has dedicated coverage in leaderboard.service.spec.ts. This
    // still catches a plausible mapping mistake like `count: player.id`.
    expect(leaderboard.topRanksWithTies).toHaveBeenCalledWith(
      [
        { id: 9, name: 'Griff', sppTotal: 130, count: 130 },
        { id: 10, name: 'Varag', sppTotal: 88, count: 88 },
      ],
      5, // TOP_PLAYERS_TOP_ENTRIES, not exported from the service
    );
  });

  it("appends each top player's team and coach context to their name", async () => {
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        topPlayers: [{ id: 9, name: 'Griff', sppTotal: 130 }],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
      playerContext: passthroughPlayerContext(' (Reikland Reavers, Bob)'),
    });

    expect(JSON.stringify(await service.resolve(1))).toContain(
      '1. Griff (Reikland Reavers, Bob) — 130',
    );
  });

  it('decorates top players with their team and coach only, not position, race or era', async () => {
    const { service, playerContext } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [] },
        topPlayers: [{ id: 9, name: 'Griff', sppTotal: 130 }],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    await service.resolve(1);

    // Every player already holds this same position — repeating it on each
    // row would say nothing new — and a position is not scoped to one race
    // or one era, so neither belongs here either.
    expect(playerContext.attachSuffixes).toHaveBeenCalledWith(
      [{ id: 9, name: 'Griff', sppTotal: 130, count: 130, rank: 1 }],
      expect.any(Function) as (row: unknown) => number,
      {
        includePosition: false,
        includeTeam: true,
        includeRace: false,
        includeEra: false,
        includeCoach: true,
      },
    );
  });

  it('appends the overflow note when the entity components overflow', async () => {
    const entityComponents = mock<EntityComponentsService>();
    entityComponents.buildEntityComponents.mockReturnValue({
      components: [],
      overflowNote: '…and 3 more not shown.',
    });
    entityComponents.getEmojiForPrefix.mockReturnValue('🏃');
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [{ id: 2, name: 'Human' }] },
      }),
      positionRulesSets: makeRulesSets([bb2020]),
      entityComponents,
    });

    expect(JSON.stringify(await service.resolve(1))).toContain(
      '…and 3 more not shown.',
    );
  });

  it('truncates the description to the Discord embed cap when a position has an unbounded number of races', async () => {
    // findById carries no cap on how many races a position resolves to, so a
    // position linked to many races (or races with long names) can produce a
    // description longer than Discord's MAX_DESCRIPTION_LENGTH. One name here
    // is ~9 chars plus a separator; 600 of them comfortably exceeds 4096.
    const manyRaces = Array.from({ length: 600 }, (_unused, index) => ({
      id: index,
      name: `Race ${index}`,
    }));
    const { service } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: manyRaces },
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    const result = await service.resolve(1);

    const description = (result as { embeds: { description: string }[] })
      .embeds[0].description;
    expect(description.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(description.endsWith('…')).toBe(true);
  });

  it('offers race buttons ahead of top-player buttons', async () => {
    const { service, entityComponents } = await makeService({
      positions: makePositions({
        position: { name: 'Blitzer', races: [{ id: 2, name: 'Human' }] },
        topPlayers: [{ id: 9, name: 'Griff', sppTotal: 130 }],
      }),
      positionRulesSets: makeRulesSets([bb2020]),
    });

    await service.resolve(1);

    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
      {
        customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '2',
        label: 'Human',
      },
      {
        customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '9',
        label: 'Griff',
      },
    ]);
  });
});

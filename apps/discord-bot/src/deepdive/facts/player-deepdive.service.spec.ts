import type { PlayerHonor } from '@blood-bowl-tracker/game-data';
import {
  PlayersService,
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
  DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import {
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PlayerDeepdiveService } from './player-deepdive.service';

const griff = {
  id: 1,
  name: 'Griff Oberwald',
  teamName: 'Reikland Reavers',
  teamId: 11,
  raceName: 'Human',
  raceId: 4,
  positionName: 'Blitzer',
  eraName: 'Season 5',
  eraId: 7,
  sppTotal: null as number | null,
  sppAdjustment: null as number | null,
};
const mvp: PlayerHonor = {
  trophyId: 7,
  trophyName: 'MVP',
  competitionId: 50,
  competitionName: 'Major Season 24',
  competitionStartDate: '2024-01-15',
};
const mostViolent: PlayerHonor = {
  trophyId: 9,
  trophyName: 'Most Violent Player',
  competitionId: 49,
  competitionName: 'Minor Season 23',
  competitionStartDate: '2023-01-15',
};

/**
 * A `TrophyAwardsService` mock. Defaults to a player with no honors, so tests
 * about other parts of the embed are unaffected by the Honors section, which
 * is omitted entirely in that case. `count` defaults to the row count, so a
 * test only supplies it when exercising the overflow remainder.
 */
function makeTrophyAwards(
  honors: PlayerHonor[] = [],
  count = honors.length,
): MockProxy<TrophyAwardsService> {
  const trophyAwards = mock<TrophyAwardsService>();
  trophyAwards.countByPlayer.mockResolvedValue(count);
  trophyAwards.listByPlayer.mockResolvedValue(honors);
  return trophyAwards;
}

interface MakeServiceOptions {
  players: PlayersService;
  databaseTimeout?: MockProxy<DatabaseTimeoutService>;
  entityComponents?: MockProxy<EntityComponentsService>;
  trophyAwards?: MockProxy<TrophyAwardsService>;
}

async function makeService({
  players,
  databaseTimeout = mockDatabaseTimeout(),
  entityComponents = nullEntityComponents(),
  trophyAwards = makeTrophyAwards(),
}: MakeServiceOptions): Promise<{
  service: PlayerDeepdiveService;
  entityComponents: MockProxy<EntityComponentsService>;
  trophyAwards: MockProxy<TrophyAwardsService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerDeepdiveService,
      { provide: PlayersService, useValue: players },
      { provide: DatabaseTimeoutService, useValue: databaseTimeout },
      { provide: EntityComponentsService, useValue: entityComponents },
      { provide: TrophyAwardsService, useValue: trophyAwards },
    ],
  }).compile();
  return {
    service: moduleRef.get(PlayerDeepdiveService),
    entityComponents,
    trophyAwards,
  };
}

function makePlayers(options: {
  player?: {
    id: number;
    name: string;
    teamName: string;
    teamId: number;
    raceName: string;
    raceId: number;
    positionName: string;
    eraName: string;
    eraId: number;
    sppTotal: number | null;
    sppAdjustment: number | null;
  };
  counts?: { label: string; count: number }[];
}): PlayersService {
  const players = mock<PlayersService>();
  players.findById.mockResolvedValue(options.player);
  players.getDeepdiveCategoryCounts.mockResolvedValue(options.counts ?? []);
  return players;
}

async function describeFor(spp: {
  sppTotal: number | null;
  sppAdjustment: number | null;
}): Promise<string> {
  const { service } = await makeService({
    players: makePlayers({
      player: { ...griff, ...spp },
      counts: [{ label: 'Touchdowns scored', count: 3 }],
    }),
  });
  const result = (await service.resolve(1)) as {
    embeds: { description: string }[];
  };
  return result.embeds[0].description;
}

describe('PlayerDeepdiveService', () => {
  it('returns the not-found message when the player does not exist', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: undefined }),
    });
    const result = await service.resolve(999);
    expect(result).toBe(DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE);
  });

  it('renders the header and only the non-zero categories', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: [
          { label: 'MVP awards', count: 2 },
          { label: 'Touchdowns scored', count: 5 },
          { label: 'Completions', count: 0 },
          { label: 'Interceptions', count: 0 },
          { label: 'Deflections', count: 0 },
          { label: 'Casualties inflicted', count: 3 },
          { label: 'Serious injuries inflicted', count: 0 },
          { label: 'Opponents killed', count: 0 },
          { label: 'Fouls committed', count: 1 },
        ],
      }),
    });
    const result = await service.resolve(1);
    expect(result).toMatchObject({
      embeds: [
        {
          title: `${stubEntityEmoji(PLAYER_BUTTON_CUSTOM_ID_PREFIX)} Griff Oberwald`,
          description: [
            'Team: Reikland Reavers',
            'Era: Season 5',
            'Race: Human',
            'Position: Blitzer',
            '',
            'MVP awards: 2',
            'Touchdowns scored: 5',
            'Casualties inflicted: 3',
            'Fouls committed: 1',
          ].join('\n'),
        },
      ],
    });
  });

  it('shows the no-events placeholder when every category is zero', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: [
          { label: 'MVP awards', count: 0 },
          { label: 'Touchdowns scored', count: 0 },
        ],
      }),
    });
    const result = await service.resolve(1);
    expect(result).toMatchObject({
      embeds: [
        {
          title: `${stubEntityEmoji(PLAYER_BUTTON_CUSTOM_ID_PREFIX)} Griff Oberwald`,
          description: [
            'Team: Reikland Reavers',
            'Era: Season 5',
            'Race: Human',
            'Position: Blitzer',
            '',
            DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
          ].join('\n'),
        },
      ],
    });
  });

  // EntityComponentsService's own dedupe/cap/chunk/select logic is covered
  // by entity-components.service.spec.ts. Here `entityComponents` is a mock
  // returning a canned component list, so this test asserts only what
  // PlayerDeepdiveService itself owns: the team-then-era-then-race entry pool
  // (in that order, matching the header lines, with the right ids/labels) it
  // hands to buildEntityComponents.
  it('builds team, era, and race entries from the header, in header order', async () => {
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
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: [{ label: 'Touchdowns', count: 3 }],
      }),
      entityComponents,
    });
    const result = (await service.resolve(1)) as unknown as {
      components: unknown;
    };
    expect(result.components).toBe(cannedComponents);
    const [entries] = entityComponents.buildEntityComponents.mock.calls[0];
    expect(entries).toEqual([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '11',
        label: 'Reikland Reavers',
      },
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '7',
        label: 'Season 5',
      },
      {
        customIdPrefix: RACE_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '4',
        label: 'Human',
      },
    ]);
  });

  it('renders the honors section between the header and the category counts', async () => {
    const { service, trophyAwards } = await makeService({
      players: makePlayers({
        player: griff,
        counts: [{ label: 'Touchdowns scored', count: 3 }],
      }),
      trophyAwards: makeTrophyAwards([mvp, mostViolent]),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(trophyAwards.countByPlayer).toHaveBeenCalledWith(1);
    expect(trophyAwards.listByPlayer).toHaveBeenCalledWith(1, 30);
    expect(result.embeds[0].description).toBe(
      [
        'Team: Reikland Reavers',
        'Era: Season 5',
        'Race: Human',
        'Position: Blitzer',
        '',
        'Honors:',
        'Major Season 24 (MVP)',
        'Minor Season 23 (Most Violent Player)',
        '',
        'Touchdowns scored: 3',
      ].join('\n'),
    );
  });

  it('omits the honors section entirely when the player has won nothing', async () => {
    const { service, trophyAwards } = await makeService({
      players: makePlayers({
        player: griff,
        counts: [{ label: 'Touchdowns scored', count: 3 }],
      }),
      trophyAwards: makeTrophyAwards([]),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    // The count is zero, so the list query is never issued at all — a timeout
    // there must not be able to turn a known "no honors" answer into a
    // spurious timeout message.
    expect(trophyAwards.listByPlayer).not.toHaveBeenCalled();
    expect(result.embeds[0].description).toBe(
      [
        'Team: Reikland Reavers',
        'Era: Season 5',
        'Race: Human',
        'Position: Blitzer',
        '',
        'Touchdowns scored: 3',
      ].join('\n'),
    );
  });

  it('omits the section and the overflow note when the list comes back empty against a stale nonzero count', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: [{ label: 'Touchdowns scored', count: 3 }],
      }),
      trophyAwards: makeTrophyAwards([], 4),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).not.toContain('Honors:');
    expect(lines.some((line) => line.includes('more not shown.'))).toBe(false);
  });

  it('appends an exact remainder note when there are more honors than shown', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: [{ label: 'Touchdowns scored', count: 3 }],
      }),
      trophyAwards: makeTrophyAwards([mvp], 34),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.split('\n')).toContain(
      '…and 33 more not shown.',
    );
  });

  it("keeps the description within Discord's 4096-character embed limit even with many long honor names", async () => {
    const longHonors: PlayerHonor[] = Array.from(
      { length: 30 },
      (_, index) => ({
        trophyId: index + 1,
        trophyName: 'T'.repeat(70),
        competitionId: 100 + index,
        competitionName: 'C'.repeat(70),
        competitionStartDate: '2024-01-15',
      }),
    );
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: [{ label: 'Touchdowns scored', count: 3 }],
      }),
      trophyAwards: makeTrophyAwards(longHonors, 30),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const description = result.embeds[0].description;
    expect(description.length).toBeLessThanOrEqual(4096);

    const lines = description.split('\n');
    const shownHonorCount = lines.filter((line) =>
      line.startsWith('C'.repeat(70)),
    ).length;
    const overflowLine = lines.find((line) => line.includes('more not shown.'));
    expect(overflowLine).toBeDefined();
    const remainder = Number(
      overflowLine?.match(/…and (\d+) more not shown\./)?.[1],
    );
    expect(shownHonorCount + remainder).toBe(30);
    expect(shownHonorCount).toBeGreaterThan(0);
  });

  it('offers one trophy button per honor, before the header buttons', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: [{ label: 'Touchdowns scored', count: 3 }],
      }),
      entityComponents: passthroughEntityComponents(),
      trophyAwards: makeTrophyAwards([mvp, mostViolent]),
    });
    const result = (await service.resolve(1)) as unknown as {
      components: { components: { label: string; custom_id: string }[] }[];
    };
    const buttons = result.components.flatMap((row) => row.components);
    expect(buttons.map((button) => button.custom_id)).toEqual([
      `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}7`,
      `${TROPHY_BUTTON_CUSTOM_ID_PREFIX}9`,
      `${TEAM_BUTTON_CUSTOM_ID_PREFIX}11`,
      `${ERA_BUTTON_CUSTOM_ID_PREFIX}7`,
      `${RACE_BUTTON_CUSTOM_ID_PREFIX}4`,
    ]);
    expect(buttons.map((button) => button.label)).toEqual([
      'MVP',
      'Most Violent Player',
      'Reikland Reavers',
      'Season 5',
      'Human',
    ]);
  });

  it('falls back to the honors timeout message when the honors count times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run.mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          players: makePlayers({ player: griff }),
          trophyAwards: makeTrophyAwards([mvp]),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the honors timeout message when the honors list times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          players: makePlayers({ player: griff }),
          trophyAwards: makeTrophyAwards([mvp]),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the player timeout message when the lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          players: makePlayers({}),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the counts timeout message when the counts lookup times out', async () => {
    await expectTimeoutFallback(
      async () => {
        const databaseTimeout = mockDatabaseTimeout();
        databaseTimeout.run
          .mockImplementationOnce(async (work) => work)
          .mockImplementationOnce(async (work) => work);
        stubDatabaseTimeoutOnce(databaseTimeout);
        const { service } = await makeService({
          players: makePlayers({ player: griff }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
    );
  });

  it('omits the total section entirely when no total is computed', async () => {
    const description = await describeFor({
      sppTotal: null,
      sppAdjustment: 2,
    });
    expect(description).toBe(
      [
        'Team: Reikland Reavers',
        'Era: Season 5',
        'Race: Human',
        'Position: Blitzer',
        '',
        'Touchdowns scored: 3',
      ].join('\n'),
    );
  });

  it('shows the total alone when there is no adjustment', async () => {
    const description = await describeFor({
      sppTotal: 12,
      sppAdjustment: null,
    });
    expect(description).toBe(
      [
        'Team: Reikland Reavers',
        'Era: Season 5',
        'Race: Human',
        'Position: Blitzer',
        '',
        'Touchdowns scored: 3',
        '',
        'Total star player points: 12',
      ].join('\n'),
    );
  });

  it('treats a zero adjustment as no adjustment', async () => {
    const description = await describeFor({ sppTotal: 12, sppAdjustment: 0 });
    expect(description).not.toContain('Star player points adjustment');
    expect(description).toContain('Total star player points: 12');
  });

  it('shows a positive adjustment with an explicit plus sign', async () => {
    const description = await describeFor({ sppTotal: 24, sppAdjustment: 2 });
    expect(description).toBe(
      [
        'Team: Reikland Reavers',
        'Era: Season 5',
        'Race: Human',
        'Position: Blitzer',
        '',
        'Touchdowns scored: 3',
        '',
        'Star player points adjustment: +2 (included)',
        'Total star player points: 24',
      ].join('\n'),
    );
  });

  it('shows a negative adjustment with its own minus sign', async () => {
    const description = await describeFor({ sppTotal: 8, sppAdjustment: -3 });
    expect(description).toBe(
      [
        'Team: Reikland Reavers',
        'Era: Season 5',
        'Race: Human',
        'Position: Blitzer',
        '',
        'Touchdowns scored: 3',
        '',
        'Star player points adjustment: -3 (included)',
        'Total star player points: 8',
      ].join('\n'),
    );
  });

  it('shows a computed total of zero rather than omitting it', async () => {
    // 0 is a real computed value, distinct from null ("not computed"), so
    // unlike a zero category count it is not suppressed.
    const description = await describeFor({ sppTotal: 0, sppAdjustment: null });
    expect(description).toContain('Total star player points: 0');
  });

  it('appends the total after the no-events placeholder', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: { ...griff, sppTotal: 4, sppAdjustment: null },
        counts: [{ label: 'Touchdowns scored', count: 0 }],
      }),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description).toBe(
      [
        'Team: Reikland Reavers',
        'Era: Season 5',
        'Race: Human',
        'Position: Blitzer',
        '',
        DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
        '',
        'Total star player points: 4',
      ].join('\n'),
    );
  });
});

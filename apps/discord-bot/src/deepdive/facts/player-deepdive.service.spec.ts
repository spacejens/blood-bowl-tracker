import type {
  PlayerDeepdiveCategoryCounts,
  PlayerHonor,
  PlayerKillerInfo,
} from '@blood-bowl-tracker/game-data';
import { describe, expect, it } from 'vitest';

import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import {
  entityComponentsMock,
  passthroughEntityComponents,
  STUB_BUTTON_EMOJI,
} from '../../entity-components-mock.test-helpers';
import {
  DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_DEATH_TIMEOUT_MESSAGE,
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
import {
  championsOfDeath,
  gougedEye,
  griff,
  makePlayerDeath,
  makePlayers,
  makeService,
  makeTrophyAwards,
} from './player-deepdive.test-helpers';

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
const chaosAllStars = {
  teamId: 14,
  teamName: 'Chaos All-Stars',
  raceId: 7,
  raceName: 'Chaos',
  coachId: 24,
  coachName: 'Nurgle',
};

/**
 * The description a player with the given killer renders, with one non-zero
 * category so the embed has a body. Keeps each per-kind line assertion to a
 * single expectation.
 */
async function describeKilledBy(killer: PlayerKillerInfo): Promise<string> {
  const { service } = await makeService({
    players: makePlayers({
      player: griff,
      counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
    }),
    playerDeath: makePlayerDeath(killer),
  });
  const result = (await service.resolve(1)) as {
    embeds: { description: string }[];
  };
  return result.embeds[0].description;
}

async function describeFor(spp: {
  sppTotal: number | null;
  sppAdjustment: number | null;
}): Promise<string> {
  const { service } = await makeService({
    players: makePlayers({
      player: { ...griff, ...spp },
      counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
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

  /** The description for a player with the given counters and nothing else. */
  async function describeCounts(
    counts: Partial<PlayerDeepdiveCategoryCounts>,
  ): Promise<string> {
    const { service } = await makeService({
      players: makePlayers({ player: griff, counts }),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    return result.embeds[0].description;
  }

  it('renders the simple categories, skipping the zero ones', async () => {
    const description = await describeCounts({
      simple: [
        { label: 'MVP awards', count: 2 },
        { label: 'Touchdowns scored', count: 5 },
        { label: 'Completions', count: 0 },
      ],
    });

    expect(description).toContain('MVP awards: 2');
    expect(description).toContain('Touchdowns scored: 5');
    expect(description).not.toContain('Completions');
  });

  it('renders both sub-counts in the casualty breakdown', async () => {
    const description = await describeCounts({
      casualties: { total: 6, seriousInjuries: 2, killed: 1 },
    });

    expect(description).toContain(
      'Casualties inflicted: 6 (2 serious injuries, 1 killed)',
    );
  });

  it('omits a zero serious-injury sub-count and its comma', async () => {
    const description = await describeCounts({
      casualties: { total: 6, seriousInjuries: 0, killed: 1 },
    });

    expect(description).toContain('Casualties inflicted: 6 (1 killed)');
  });

  it('omits a zero killed sub-count and its comma', async () => {
    const description = await describeCounts({
      casualties: { total: 6, seriousInjuries: 2, killed: 0 },
    });

    expect(description).toContain(
      'Casualties inflicted: 6 (2 serious injuries)',
    );
  });

  it('omits the parenthetical entirely when both sub-counts are zero', async () => {
    const description = await describeCounts({
      casualties: { total: 6, seriousInjuries: 0, killed: 0 },
    });

    expect(description).toContain('Casualties inflicted: 6');
    expect(description).not.toContain('Casualties inflicted: 6 (');
  });

  it('renders the foul breakdown the same way', async () => {
    const description = await describeCounts({
      fouls: { total: 7, seriousInjuries: 3, killed: 2 },
    });

    expect(description).toContain(
      'Fouls committed: 7 (3 serious injuries, 2 killed)',
    );
  });

  it('omits a whole group whose total is zero', async () => {
    const description = await describeCounts({
      simple: [{ label: 'MVP awards', count: 1 }],
    });

    expect(description).not.toContain('Casualties inflicted');
    expect(description).not.toContain('Fouls committed');
  });

  it('shows the nothing-memorable message when every counter is zero', async () => {
    const description = await describeCounts({});

    expect(description).toContain(DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE);
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
        counts: { simple: [{ label: 'Touchdowns', count: 3 }] },
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
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
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
        'Trophies:',
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
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
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
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
      }),
      trophyAwards: makeTrophyAwards([], 4),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).not.toContain('Trophies:');
    expect(lines.some((line) => line.includes('more not shown.'))).toBe(false);
  });

  it('appends an exact remainder note when there are more honors than shown', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
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
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
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

  it('still shows an exact remainder note when even the first fetched honor cannot fit', async () => {
    const hugeHonor: PlayerHonor = {
      trophyId: 1,
      trophyName: 'Y'.repeat(2000),
      competitionId: 1,
      competitionName: 'X'.repeat(2000),
      competitionStartDate: '2024-01-15',
    };
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
      }),
      trophyAwards: makeTrophyAwards([hugeHonor], 5),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const lines = result.embeds[0].description.split('\n');
    expect(lines).toContain('Trophies:');
    expect(lines).toContain('…and 5 more not shown.');
    expect(lines.some((line) => line.startsWith('X'))).toBe(false);
  });

  it('never exceeds the description limit even when the non-honor content alone is already near it', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: { simple: [{ label: 'Z'.repeat(4090), count: 1 }] },
      }),
      trophyAwards: makeTrophyAwards([mvp], 5),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    expect(result.embeds[0].description.length).toBeLessThanOrEqual(4096);
  });

  it('offers one trophy button per honor, before the header buttons', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
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

  it('shows who killed the player and offers a drill-down to them', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
      }),
      playerDeath: makePlayerDeath({
        kind: 'player',
        playerId: 77,
        playerName: 'Varag Ghoul-Chewer',
        positionName: 'Blitzer',
        teamId: 12,
        teamName: 'Gouged Eye',
        raceId: 5,
        raceName: 'Orc',
        coachId: 22,
        coachName: 'Grimly',
        viaFoul: false,
      }),
      entityComponents: passthroughEntityComponents(),
    });

    const result = (await service.resolve(1)) as unknown as {
      embeds: { description: string }[];
      components: { components: { custom_id: string; label: string }[] }[];
    };

    expect(result.embeds[0].description).toBe(
      [
        'Team: Reikland Reavers',
        'Era: Season 5',
        'Race: Human',
        'Position: Blitzer',
        'Status: Killed by Varag Ghoul-Chewer (Blitzer, Gouged Eye, Orc, Grimly)',
        '',
        'Touchdowns scored: 3',
      ].join('\n'),
    );
    expect(result.components[0].components[0]).toMatchObject({
      custom_id: `${PLAYER_BUTTON_CUSTOM_ID_PREFIX}77`,
      label: 'Varag Ghoul-Chewer',
    });
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
        counts: { simple: [{ label: 'Touchdowns scored', count: 0 }] },
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

  it('shows no Status line for a player who has not died', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
      }),
    });

    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };

    expect(result.embeds[0].description).not.toContain('Status:');
  });

  it('names the killing team when the individual is unidentified', async () => {
    const description = await describeKilledBy({
      kind: 'team',
      ...gougedEye,
      viaFoul: false,
    });

    expect(description).toContain('Status: Killed by Gouged Eye (Orc, Grimly)');
  });

  it('offers a team drill-down for a team killer', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      playerDeath: makePlayerDeath({
        kind: 'team',
        ...gougedEye,
        viaFoul: false,
      }),
      entityComponents: passthroughEntityComponents(),
    });

    const result = (await service.resolve(1)) as unknown as {
      components: { components: { custom_id: string; label: string }[] }[];
    };

    expect(result.components[0].components[0]).toMatchObject({
      custom_id: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}12`,
      label: 'Gouged Eye',
    });
  });

  it('joins exactly two candidate teams with a bare "or"', async () => {
    const description = await describeKilledBy({
      kind: 'ambiguousTeams',
      teams: [gougedEye, championsOfDeath],
      viaFoul: false,
    });

    expect(description).toContain(
      'Status: Killed by Gouged Eye (Orc, Grimly) or Champions of Death (Undead, Mortis)',
    );
  });

  it('joins three or more candidate teams with an Oxford comma before "or"', async () => {
    const description = await describeKilledBy({
      kind: 'ambiguousTeams',
      teams: [gougedEye, championsOfDeath, chaosAllStars],
      viaFoul: false,
    });

    expect(description).toContain(
      'Status: Killed by Gouged Eye (Orc, Grimly), Champions of Death (Undead, Mortis), or Chaos All-Stars (Chaos, Nurgle)',
    );
  });

  it('offers one team drill-down per candidate team', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      playerDeath: makePlayerDeath({
        kind: 'ambiguousTeams',
        teams: [gougedEye, championsOfDeath],
        viaFoul: false,
      }),
      entityComponents: passthroughEntityComponents(),
    });

    const result = (await service.resolve(1)) as unknown as {
      components: { components: { custom_id: string; label: string }[] }[];
    };

    expect(result.components[0].components.slice(0, 2)).toMatchObject([
      { custom_id: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}12`, label: 'Gouged Eye' },
      {
        custom_id: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}13`,
        label: 'Champions of Death',
      },
    ]);
  });

  it('falls back to mysterious circumstances with no killer button', async () => {
    const { service, entityComponents } = await makeService({
      players: makePlayers({ player: griff }),
      playerDeath: makePlayerDeath({ kind: 'unknown', viaFoul: false }),
      entityComponents: passthroughEntityComponents(),
    });

    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };

    expect(result.embeds[0].description).toContain(
      'Status: Killed in mysterious circumstances',
    );
    // Only the player's own team, era and race entries — no killer entry.
    expect(entityComponents.buildEntityComponents).toHaveBeenCalledWith([
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

  it('notes when the killing blow came from a foul', async () => {
    const description = await describeKilledBy({
      kind: 'team',
      ...gougedEye,
      viaFoul: true,
    });

    expect(description).toContain(
      'Status: Killed by Gouged Eye (Orc, Grimly) (via a foul)',
    );
  });

  it('falls back to a themed message when the death query times out', async () => {
    const databaseTimeout = mockDatabaseTimeout();
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      databaseTimeout,
    });
    // The player, honors-count and category-count queries pass through; only the
    // death lookup resolves with its caller's own fallback, exactly as the real
    // `run` does when the timeout wins. Griff has no honors (the default
    // `makeTrophyAwards()` count is 0), so the honors-list query is never
    // issued, leaving exactly these four `run` calls: player, honors count,
    // category counts, then the death lookup.
    databaseTimeout.run
      .mockResolvedValueOnce(griff)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined);

    await expect(service.resolve(1)).resolves.toBe(
      DEEPDIVE_PLAYER_DEATH_TIMEOUT_MESSAGE,
    );
  });

  // The Kills section has its own spec file — see
  // `player-deepdive-kills.service.spec.ts` — split out purely for this
  // file's size (see `player-deepdive.test-helpers.ts`).
});

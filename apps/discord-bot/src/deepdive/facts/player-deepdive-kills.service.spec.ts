import type {
  PlayerHonor,
  PlayerKillEntry,
} from '@blood-bowl-tracker/game-data';
import { describe, expect, it } from 'vitest';

import {
  mockDatabaseTimeout,
  stubDatabaseTimeoutOnce,
} from '../../database-timeout-mock.test-helpers';
import { passthroughEntityComponents } from '../../entity-components-mock.test-helpers';
import { DEEPDIVE_PLAYER_KILLS_TIMEOUT_MESSAGE } from '../../error-messages';
import { expectTimeoutFallback } from '../../insights/facts/toplist.test-helpers';
import {
  championsOfDeath,
  gougedEye,
  griff,
  makePlayerDeath,
  makePlayers,
  makeService,
  makeTrophyAwards,
} from './player-deepdive.test-helpers';

/**
 * `PlayerDeepdiveService`'s Kills section, split out of
 * `player-deepdive.service.spec.ts` purely for that file's size — see
 * `player-deepdive.test-helpers.ts` for why, and for the shared fixtures both
 * files use.
 */
describe('PlayerDeepdiveService kills section', () => {
  const victim: PlayerKillEntry = {
    kind: 'player',
    playerId: 88,
    playerName: 'Griff Oberwald',
    positionName: 'Blitzer',
    ...gougedEye,
    viaFoul: false,
  };

  /** The description for a player credited with the given kills. */
  async function describeKills(
    kills: PlayerKillEntry[],
    killsTotal = kills.length,
  ): Promise<string> {
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
      }),
      playerDeath: makePlayerDeath(null, kills, killsTotal),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    return result.embeds[0].description;
  }

  it('omits the Kills section entirely for a player who has killed nobody', async () => {
    expect(await describeKills([])).not.toContain('Kills:');
  });

  it('lists the kills after the SPP totals', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: { ...griff, sppTotal: 42 },
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
      }),
      playerDeath: makePlayerDeath(null, [victim]),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const description = result.embeds[0].description;

    expect(description).toContain(
      'Kills:\nGriff Oberwald (Blitzer, Gouged Eye, Orc, Grimly)',
    );
    expect(description.indexOf('Touchdowns scored')).toBeLessThan(
      description.indexOf('Total star player points'),
    );
    expect(description.indexOf('Total star player points')).toBeLessThan(
      description.indexOf('Kills:'),
    );
  });

  it('ends the Kills list with an exact remainder when there are more', async () => {
    expect(await describeKills([victim], 34)).toContain(
      '…and 33 more not shown.',
    );
  });

  it('skips the kills list query for a player with no kills', async () => {
    const playerDeath = makePlayerDeath(null, [], 0);
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      playerDeath,
    });

    await service.resolve(1);

    expect(playerDeath.getKillsInflicted).not.toHaveBeenCalled();
  });

  it('fetches at most 30 kills', async () => {
    const playerDeath = makePlayerDeath(null, [victim], 34);
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      playerDeath,
    });

    await service.resolve(1);

    expect(playerDeath.getKillsInflicted).toHaveBeenCalledWith(1, 30);
  });

  it('buttons every listed victim, after the killer and before the header buttons', async () => {
    const { service, entityComponents } = await makeService({
      players: makePlayers({ player: griff }),
      entityComponents: passthroughEntityComponents(),
      playerDeath: makePlayerDeath(
        { kind: 'team', ...championsOfDeath, viaFoul: false },
        [victim],
      ),
    });

    await service.resolve(1);

    const entries = entityComponents.buildEntityComponents.mock.calls[0][0];
    expect(entries.map((entry) => entry.label)).toEqual([
      'Champions of Death',
      'Griff Oberwald',
      'Reikland Reavers',
      'Season 5',
      'Human',
    ]);
  });

  it('trims honors, not kills, when adding the kills section is what pushes the description over the limit', async () => {
    // The kills section is budgeted before honors (see the class doc
    // comment): kills reserve their space against only the header/counts,
    // while honors reserve theirs against header/counts *plus* the
    // already-built kills section. `longHonors` alone (with these 30 kills
    // absent) comfortably fits within the 4096-char limit in full — see the
    // sibling honors-only test in `player-deepdive.service.spec.ts`, which
    // uses a longer honor fixture that overflows even without any kills.
    // Adding the 30-row kills section below is what pushes the combined
    // description over budget, so it's specifically the kills section — not
    // an honors list that would have overflowed regardless — that causes the
    // honors truncation this test asserts on.
    const longHonors: PlayerHonor[] = Array.from(
      { length: 30 },
      (_, index) => ({
        trophyId: index + 1,
        trophyName: 'T'.repeat(60),
        competitionId: 100 + index,
        competitionName: 'C'.repeat(60),
        competitionStartDate: '2024-01-15',
      }),
    );
    const longKills: PlayerKillEntry[] = Array.from(
      { length: 30 },
      (_, index) => ({
        kind: 'player',
        playerId: 200 + index,
        playerName: `Victim ${index}`,
        positionName: 'Blitzer',
        ...gougedEye,
        viaFoul: false,
      }),
    );
    const { service } = await makeService({
      players: makePlayers({
        player: griff,
        counts: { simple: [{ label: 'Touchdowns scored', count: 3 }] },
      }),
      trophyAwards: makeTrophyAwards(longHonors, 30),
      playerDeath: makePlayerDeath(null, longKills, longKills.length),
    });
    const result = (await service.resolve(1)) as {
      embeds: { description: string }[];
    };
    const description = result.embeds[0].description;

    expect(description.length).toBeLessThanOrEqual(4096);

    // Every kill row survives intact: no kill overflow note, and every
    // victim's name appears.
    longKills.forEach((kill) => {
      if (kill.kind === 'player') {
        expect(description).toContain(kill.playerName);
      }
    });

    // The honors section is what gets trimmed, with its own exact remainder
    // note — and only the honors section produces one, since the kills list
    // fit in full.
    const lines = description.split('\n');
    const shownHonorCount = lines.filter((line) =>
      line.startsWith('C'.repeat(60)),
    ).length;
    expect(shownHonorCount).toBeGreaterThan(0);
    expect(shownHonorCount).toBeLessThan(30);
    const overflowLines = lines.filter((line) =>
      line.includes('more not shown.'),
    );
    expect(overflowLines).toHaveLength(1);
    expect(overflowLines[0]).toBe(
      `…and ${30 - shownHonorCount} more not shown.`,
    );
  });

  it('falls back to the kills timeout message when the kills count times out', async () => {
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
          players: makePlayers({ player: griff }),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_PLAYER_KILLS_TIMEOUT_MESSAGE,
    );
  });

  it('falls back to the kills timeout message when the kills list times out', async () => {
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
          players: makePlayers({ player: griff }),
          playerDeath: makePlayerDeath(null, [], 5),
          databaseTimeout,
        });
        return service.resolve(1);
      },
      () => undefined,
      DEEPDIVE_PLAYER_KILLS_TIMEOUT_MESSAGE,
    );
  });
});

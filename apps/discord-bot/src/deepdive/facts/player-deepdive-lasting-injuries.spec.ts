import type { InteractionReplyOptions } from 'discord.js';
import { describe, expect, it } from 'vitest';

import {
  griff,
  makePlayers,
  makePositionRulesSets,
  makeService,
} from './player-deepdive.test-helpers';

/** BB2020 formats, so the characteristics line renders alongside. */
const bb2020 = {
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus_zero_legal',
  armourFormat: 'plus',
  baseline: undefined,
} as const;

const INJURED = {
  missNextGame: true,
  nigglingInjuryCount: 1,
  moveReductionCount: 0,
  strengthReductionCount: 1,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

/**
 * The embed description of a resolved reply. Throws for a plain string reply
 * (a timeout or not-found message) rather than returning '', so a
 * `not.toContain(...)` assertion cannot pass vacuously.
 */
function descriptionOf(reply: string | InteractionReplyOptions): string {
  if (typeof reply === 'string') {
    throw new Error(`Expected an embed reply, got the plain string: ${reply}`);
  }
  return (
    (reply.embeds?.[0] as { description?: string } | undefined)?.description ??
    ''
  );
}

describe('PlayerDeepdiveService lasting-injuries line', () => {
  it('renders every kind of active injury, in a fixed order', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: { ...griff, ...INJURED } }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Lasting injuries: Miss next game, 1 niggling injury, ST -1',
    );
  });

  it('omits the line entirely for a player with no active lasting injury', async () => {
    // "No injuries" is the overwhelmingly common case; a "none" line on every
    // healthy player would be noise.
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).not.toContain(
      'Lasting injuries:',
    );
  });

  it('pluralises the niggling-injury count', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: { ...griff, nigglingInjuryCount: 3 },
      }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Lasting injuries: 3 niggling injuries',
    );
  });

  it('lists the reductions in MA/ST/AG/PA/AV order, skipping the unreduced', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: {
          ...griff,
          armourReductionCount: 2,
          moveReductionCount: 1,
          agilityReductionCount: 1,
        },
      }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Lasting injuries: MA -1, AG -1, AV -2',
    );
  });

  it('renders a passing reduction', async () => {
    // The other reduction fields (MA/ST/AG/AV) each have their own dedicated
    // coverage above; PA does not, so this exercises it individually.
    const { service } = await makeService({
      players: makePlayers({
        player: { ...griff, passingReductionCount: 1 },
      }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Lasting injuries: PA -1',
    );
  });

  it('renders a miss-next-game on its own', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: { ...griff, missNextGame: true } }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Lasting injuries: Miss next game',
    );
  });

  it('sits below the characteristics line', async () => {
    const { service } = await makeService({
      players: makePlayers({ player: { ...griff, ...INJURED } }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description.indexOf('Characteristics:')).toBeLessThan(
      description.indexOf('Lasting injuries:'),
    );
  });

  it('still renders when no rules set resolves and the characteristics line is absent', async () => {
    // The two lines are independent: an injury is a fact regardless of
    // whether the player's stat line can be written correctly.
    const { service } = await makeService({
      players: makePlayers({ player: { ...griff, ...INJURED } }),
      positionRulesSets: makePositionRulesSets(undefined),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).not.toContain('Characteristics:');
    expect(description).toContain('Lasting injuries: Miss next game');
  });
});

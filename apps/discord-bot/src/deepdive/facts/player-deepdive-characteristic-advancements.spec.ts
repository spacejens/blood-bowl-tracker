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
  rulesSetId: 2,
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
  baseline: undefined,
} as const;

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

describe('PlayerDeepdiveService characteristic-advancements line', () => {
  it('omits the line entirely when no characteristic was ever increased', async () => {
    // All five counts are 0 on the shared fixture. Zero advancements is the
    // common case, so a "none" line on every such player would be noise.
    const { service } = await makeService({
      players: makePlayers({ player: griff }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).not.toContain(
      'Characteristic advancements:',
    );
  });

  it('renders a single increased characteristic', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: { ...griff, moveIncreaseCount: 1 },
      }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Characteristic advancements: MA +1',
    );
  });

  it('renders a count above one', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: { ...griff, agilityIncreaseCount: 2 },
      }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Characteristic advancements: AG +2',
    );
  });

  it('lists the increases in MA/ST/AG/PA/AV order, skipping the unincreased', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: {
          ...griff,
          armourIncreaseCount: 3,
          agilityIncreaseCount: 2,
          moveIncreaseCount: 1,
        },
      }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Characteristic advancements: MA +1, AG +2, AV +3',
    );
  });

  it('renders the strength and passing increases', async () => {
    // MA/AG/AV each have their own dedicated coverage above; ST and PA do not,
    // so this exercises both remaining fields.
    const { service } = await makeService({
      players: makePlayers({
        player: {
          ...griff,
          strengthIncreaseCount: 1,
          passingIncreaseCount: 1,
        },
      }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    expect(descriptionOf(await service.resolve(1))).toContain(
      'Characteristic advancements: ST +1, PA +1',
    );
  });

  it('sits between the characteristics line and the lasting-injuries line', async () => {
    const { service } = await makeService({
      players: makePlayers({
        player: {
          ...griff,
          moveIncreaseCount: 1,
          strengthReductionCount: 1,
        },
      }),
      positionRulesSets: makePositionRulesSets({ ...bb2020 }),
    });

    const description = descriptionOf(await service.resolve(1));

    // Explicit presence checks first: indexOf returns -1 for an absent line,
    // which would otherwise let the ordering comparisons below pass
    // vacuously if a line were removed.
    expect(description).toContain('Characteristics:');
    expect(description).toContain('Lasting injuries:');
    expect(description.indexOf('Characteristics:')).toBeLessThan(
      description.indexOf('Characteristic advancements:'),
    );
    expect(description.indexOf('Characteristic advancements:')).toBeLessThan(
      description.indexOf('Lasting injuries:'),
    );
  });

  it('still renders when no rules set resolves and the characteristics line is absent', async () => {
    // The increase counts live directly on the player row and need no rules
    // set to be meaningful, unlike the raw stat values the characteristics
    // line writes.
    const { service } = await makeService({
      players: makePlayers({
        player: { ...griff, moveIncreaseCount: 1 },
      }),
      positionRulesSets: makePositionRulesSets(undefined),
    });

    const description = descriptionOf(await service.resolve(1));

    expect(description).not.toContain('Characteristics: ');
    expect(description).toContain('Characteristic advancements: MA +1');
  });
});

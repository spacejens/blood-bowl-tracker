import { describe, expect, it } from 'vitest';

import { BATCH_001, BATCH_005, readBatch } from './curated-data.test-helpers';

const TP = 'tourplay.net';

type Advancement = { skill: string } | { characteristic: string };

/**
 * The advancement order of each player, as read oldest first from the TP
 * feed's "New skill/characteristic" notifications. Each sequence covers every
 * paid advancement the database records for the player.
 */
const EXPECTED: { player: string; advancements: Advancement[] }[] = [
  {
    // Kalle Kvist, Dalsland: spent 110 = 18 + 8 + 6 + 8 + 20 + 50.
    player: '586220',
    advancements: [
      { characteristic: 'MA' },
      { skill: 'Side Step' },
      { skill: 'Catch' },
      { skill: 'Safe Pair of Hands' },
      { skill: 'Sprint' },
      { characteristic: 'AV' },
    ],
  },
  {
    // Friska Fläkten, Gnaget: spent 104 = 6 + 20 + 12 + 16 + 20 + 30.
    player: '1233619',
    advancements: [
      { skill: 'Block' },
      { characteristic: 'AV' },
      { skill: 'Monstrous Mouth' },
      { skill: 'Sprint' },
      { skill: 'Sure Feet' },
      { skill: 'Side Step' },
    ],
  },
  {
    // K'Lent, Mega Molochs: spent 64 = 18 + 20 + 18 + 8.
    player: '587380',
    advancements: [
      { characteristic: 'PA' },
      { characteristic: 'MA' },
      { skill: 'Block' },
      { skill: 'Catch' },
    ],
  },
  {
    // Gruamax, Marstens: spent 32 = 6 + 20 + 6.
    player: '1346393',
    advancements: [
      { skill: 'Dodge' },
      { characteristic: 'ST' },
      { skill: 'Pro' },
    ],
  },
];

describe('curated batch 005 TP advancement orders', () => {
  const orders = readBatch(BATCH_005).playerAdvancementOrders;

  it('covers exactly the four players the feed settles, in order', () => {
    expect(orders.map((o) => o.player)).toEqual(
      EXPECTED.map((e) => ({ system: TP, id: e.player })),
    );
  });

  it('lists each player advancements as pinned, oldest first', () => {
    expect(
      orders.map((o) =>
        o.advancements.map((a) =>
          'skill' in a
            ? { skill: a.skill.id }
            : { characteristic: a.characteristic },
        ),
      ),
    ).toEqual(EXPECTED.map((e) => e.advancements));
  });

  it('names only skills batch 001 declares, under the Name system', () => {
    const declared = new Set(
      readBatch(BATCH_001).skillRulesSets.map((row) => row.skill.id),
    );
    for (const order of orders) {
      for (const advancement of order.advancements) {
        if ('skill' in advancement) {
          expect(advancement.skill.system).toBe('Name');
          expect(declared).toContain(advancement.skill.id);
        }
      }
    }
  });
});

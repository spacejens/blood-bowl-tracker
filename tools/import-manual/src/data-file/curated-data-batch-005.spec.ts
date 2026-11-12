import { describe, expect, it } from 'vitest';

import { BATCH_001, BATCH_005, readBatch } from './curated-data.test-helpers';

const TP = 'tourplay.net';

type Advancement =
  { skill: string; attributeValue?: string } | { characteristic: string };

/**
 * The advancement order of each player, as read oldest first from the TP
 * feed's "New skill/characteristic" notifications. Each sequence covers every
 * paid advancement the database records for the player, except where a
 * player's entry says how the rest of his order is known.
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
  {
    // Nadiddnur, Shambletown Peddlers: spent 14 = 6 + 8. The feed shows only
    // Sneaky Git, at 8, the second advancement's price; Dirty Player (a
    // random secondary skill) comes first, as TP's skill row ids also order
    // them. His gained Loner is a free extra and not listed.
    player: '1421046',
    advancements: [
      { skill: 'Dirty Player', attributeValue: '+1' },
      { skill: 'Sneaky Git' },
    ],
  },
];

describe('curated batch 005 TP advancement orders', () => {
  const all = readBatch(BATCH_005).playerAdvancementOrders;
  const orders = all.filter((o) => o.advancements.length > 0);
  const flagOnly = all.filter((o) => o.advancements.length === 0);

  it('lists the journeymen whose Loner it flags, and nothing else', () => {
    expect(flagOnly.map((o) => o.player)).toEqual([
      { system: TP, id: '2454051' },
      ...[
        3066, 3248, 3274, 3277, 3341, 3607, 3659, 3725, 3938, 3951, 4135, 4243,
        4244, 4642, 5266,
      ].map((id) => ({ system: 'tloeg.bbleague.se', id: String(id) })),
    ]);
    expect(all.slice(0, orders.length)).toEqual(orders);
  });

  it('covers exactly the five players the feed settles, in order', () => {
    expect(orders.map((o) => o.player)).toEqual(
      EXPECTED.map((e) => ({ system: TP, id: e.player })),
    );
  });

  it('lists each player advancements as pinned, oldest first', () => {
    expect(
      orders.map((o) =>
        o.advancements.map((a) =>
          'skill' in a
            ? {
                skill: a.skill.id,
                ...(a.attributeValue === undefined
                  ? {}
                  : { attributeValue: a.attributeValue }),
              }
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

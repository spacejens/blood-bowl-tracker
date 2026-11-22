import { describe, expect, it } from 'vitest';

import { BATCH_016, listBatches, readBatch } from './curated-data.test-helpers';

/** The players whose feed reports did not add up until their snapshots completed them. */
const FEED_COMPLETED_PLAYERS = ['733558', '746088', '794833', '986890'];

/** The players their roster snapshots alone prove, a gained skill carrying a spelling-variant Name id. */
const SNAPSHOT_PLAYERS = [
  '1346422',
  '2064584',
  '2064585',
  '589358',
  '595521',
  '605482',
  '607547',
];

describe('curated batch 016 TP fills from feed reports and roster snapshots', () => {
  const batch = () => readBatch(BATCH_016);

  it('holds only player fills and the systems they reference', () => {
    const sections = Object.entries(batch())
      .filter(([, entries]) => entries.length > 0)
      .map(([section]) => section)
      .sort();

    expect(sections).toEqual(['externalSystems', 'incompletePlayerFills']);
  });

  it('fills exactly the eleven players, none an earlier batch filled', () => {
    const ids = batch().incompletePlayerFills.map((entry) => entry.player.id);
    const earlier = new Set(
      listBatches()
        .filter((name) => name < BATCH_016)
        .flatMap((name) =>
          readBatch(name).incompletePlayerFills.map((entry) => entry.player.id),
        ),
    );

    expect([...ids].sort()).toEqual(
      [...FEED_COMPLETED_PLAYERS, ...SNAPSHOT_PLAYERS].sort(),
    );
    expect(ids.filter((id) => earlier.has(id))).toEqual([]);
  });

  it.each([
    {
      id: '733558',
      spent: 14,
      total: 18,
      unspent: 4,
      steps: [
        { skill: 'Block', source: 'random', cost: 6 },
        { skill: 'Wrestle', source: 'random', cost: 8 },
      ],
    },
    {
      id: '746088',
      spent: 10,
      total: 12,
      unspent: 2,
      steps: [
        { skill: 'Pro', source: 'random', cost: 6 },
        { skill: 'Diving Tackle', source: 'random', cost: 4 },
      ],
    },
    {
      id: '794833',
      spent: 7,
      total: 8,
      unspent: 1,
      steps: [
        { skill: 'Tackle', source: 'random', cost: 3 },
        { skill: 'Frenzy', source: 'random', cost: 4 },
      ],
    },
    {
      id: '986890',
      spent: 7,
      total: 7,
      unspent: 0,
      steps: [
        { skill: 'Sure Feet', source: 'random', cost: 3 },
        { skill: 'Sprint', source: 'random', cost: 4 },
      ],
    },
  ])(
    'gives player $id his two gained skills in order, costing exactly the SPP he spent',
    ({ id, spent, total, unspent, steps }) => {
      const entry = batch().incompletePlayerFills.find(
        (candidate) => candidate.player.id === id,
      );

      expect(entry?.sppTotal).toBe(total);
      expect(entry?.unspentSpp).toBe(unspent);
      expect(
        entry?.advancements.map((advancement) =>
          'skill' in advancement
            ? { skill: advancement.skill.id, source: advancement.source }
            : undefined,
        ),
      ).toEqual(steps.map(({ skill, source }) => ({ skill, source })));
      expect(steps.reduce((sum, step) => sum + step.cost, 0)).toBe(spent);
      expect(total - unspent).toBe(spent);
    },
  );

  it('names every gained skill under the Name system, with its source', () => {
    for (const entry of batch().incompletePlayerFills) {
      expect(entry.advancements.length).toBeGreaterThan(0);
      for (const advancement of entry.advancements) {
        expect('skill' in advancement).toBe(true);
        if ('skill' in advancement) {
          expect(advancement.skill.system).toBe('Name');
          expect(['chosen', 'random']).toContain(advancement.source);
        }
      }
    }
  });
});

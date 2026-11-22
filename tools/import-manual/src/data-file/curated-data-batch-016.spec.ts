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

  it('gives the feed-completed players two gained skills', () => {
    const entries = batch().incompletePlayerFills.filter((entry) =>
      FEED_COMPLETED_PLAYERS.includes(entry.player.id),
    );

    expect(entries).toHaveLength(FEED_COMPLETED_PLAYERS.length);
    for (const entry of entries) {
      expect(entry.advancements).toHaveLength(2);
    }
  });

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

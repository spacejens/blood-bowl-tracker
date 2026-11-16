import { describe, expect, it } from 'vitest';

import {
  BATCH_007,
  BATCH_008,
  BATCH_009,
  readBatch,
} from './curated-data.test-helpers';

describe('curated batch 009 TP feed fills with lasting injuries and lasting-reduction repairs', () => {
  const batch = () => readBatch(BATCH_009);

  it('holds only player fills, lasting-reduction repairs and the systems they reference', () => {
    const sections = Object.entries(batch())
      .filter(([, entries]) => entries.length > 0)
      .map(([section]) => section)
      .sort();

    expect(sections).toEqual([
      'externalSystems',
      'incompletePlayerFills',
      'lastingInjuryRepairs',
    ]);
  });

  it('fills each TP player at most once, and none an earlier batch filled', () => {
    const ids = batch().incompletePlayerFills.map((entry) => entry.player.id);
    const earlier = new Set(
      [BATCH_007, BATCH_008].flatMap((name) =>
        readBatch(name).incompletePlayerFills.map((entry) => entry.player.id),
      ),
    );

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => earlier.has(id))).toEqual([]);
  });

  it('lists each TP player for a repair at most once, and none it fills', () => {
    const ids = batch().lastingInjuryRepairs.map((entry) => entry.player.id);
    const filled = new Set(
      batch().incompletePlayerFills.map((entry) => entry.player.id),
    );

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => filled.has(id))).toEqual([]);
  });

  it('gives every player at most six advancements and no more unspent SPP than his total', () => {
    for (const entry of batch().incompletePlayerFills) {
      expect(entry.advancements.length).toBeLessThanOrEqual(6);
      expect(entry.unspentSpp).toBeLessThanOrEqual(entry.sppTotal);
    }
  });
});

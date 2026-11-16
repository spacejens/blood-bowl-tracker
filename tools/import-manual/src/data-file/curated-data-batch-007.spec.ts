import { describe, expect, it } from 'vitest';

import { BATCH_007, readBatch } from './curated-data.test-helpers';

describe('curated batch 007 low-SPP TP player fills', () => {
  const batch = () => readBatch(BATCH_007);

  it('holds only player fills and the systems they reference', () => {
    const sections = Object.entries(batch())
      .filter(([, entries]) => entries.length > 0)
      .map(([section]) => section)
      .sort();

    expect(sections).toEqual(['externalSystems', 'incompletePlayerFills']);
  });

  it('fills each TP player at most once', () => {
    const ids = batch().incompletePlayerFills.map((entry) => entry.player.id);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every player no advancements and his whole SPP unspent', () => {
    for (const entry of batch().incompletePlayerFills) {
      expect(entry.advancements).toEqual([]);
      expect(entry.unspentSpp).toBe(entry.sppTotal);
    }
  });

  it('gives every player a status the generator can derive from evidence', () => {
    for (const entry of batch().incompletePlayerFills) {
      expect(['dead', 'retired']).toContain(entry.status);
    }
  });
});

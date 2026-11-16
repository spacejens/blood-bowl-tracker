import { describe, expect, it } from 'vitest';

import { BATCH_007, BATCH_008, readBatch } from './curated-data.test-helpers';

describe('curated batch 008 TP feed and lasting-injury player fills', () => {
  const batch = () => readBatch(BATCH_008);

  it('holds only player fills and the systems they reference', () => {
    const sections = Object.entries(batch())
      .filter(([, entries]) => entries.length > 0)
      .map(([section]) => section)
      .sort();

    expect(sections).toEqual(['externalSystems', 'incompletePlayerFills']);
  });

  it('fills each TP player at most once, and none batch 007 filled', () => {
    const ids = batch().incompletePlayerFills.map((entry) => entry.player.id);
    const earlier = new Set(
      readBatch(BATCH_007).incompletePlayerFills.map(
        (entry) => entry.player.id,
      ),
    );

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => earlier.has(id))).toEqual([]);
  });

  it('gives every player at most six advancements and no more unspent SPP than his total', () => {
    for (const entry of batch().incompletePlayerFills) {
      expect(entry.advancements.length).toBeLessThanOrEqual(6);
      expect(entry.unspentSpp).toBeLessThanOrEqual(entry.sppTotal);
    }
  });

  it('gives a player without advancements his whole SPP unspent', () => {
    for (const entry of batch().incompletePlayerFills) {
      if (entry.advancements.length === 0) {
        expect(entry.unspentSpp).toBe(entry.sppTotal);
      }
    }
  });

  it('names every skill under the Name system, a reported one with its source', () => {
    for (const entry of batch().incompletePlayerFills) {
      for (const skill of entry.startingSkills) {
        expect(('skill' in skill ? skill.skill : skill).system).toBe('Name');
      }
      for (const advancement of entry.advancements) {
        if ('skill' in advancement) {
          expect(advancement.skill.system).toBe('Name');
          expect(['chosen', 'random']).toContain(advancement.source);
          expect(advancement.freeExtra).toBeUndefined();
        }
      }
    }
  });

  it('gives every player a status the generator can derive from evidence', () => {
    for (const entry of batch().incompletePlayerFills) {
      expect(['active', 'dead', 'retired', 'temporarily_retired']).toContain(
        entry.status,
      );
    }
  });
});

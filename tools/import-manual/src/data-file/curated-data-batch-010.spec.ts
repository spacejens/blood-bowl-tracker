import { describe, expect, it } from 'vitest';

import {
  BATCH_007,
  BATCH_008,
  BATCH_009,
  BATCH_010,
  readBatch,
} from './curated-data.test-helpers';

describe('curated batch 010 TP journeyman fills', () => {
  const batch = () => readBatch(BATCH_010);

  it('holds only player fills and the systems they reference', () => {
    const sections = Object.entries(batch())
      .filter(([, entries]) => entries.length > 0)
      .map(([section]) => section)
      .sort();

    expect(sections).toEqual(['externalSystems', 'incompletePlayerFills']);
  });

  it('fills each TP player at most once, and none an earlier batch filled', () => {
    const ids = batch().incompletePlayerFills.map((entry) => entry.player.id);
    const earlier = new Set(
      [BATCH_007, BATCH_008, BATCH_009].flatMap((name) =>
        readBatch(name).incompletePlayerFills.map((entry) => entry.player.id),
      ),
    );

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => earlier.has(id))).toEqual([]);
  });

  it('fills only journeymen, with no advancements and the whole SPP unspent', () => {
    for (const entry of batch().incompletePlayerFills) {
      expect(entry.journeyman).toBe(true);
      expect(entry.advancements).toEqual([]);
      expect(entry.unspentSpp).toBe(entry.sppTotal);
    }
  });

  it('leaves Loner to the server and names every skill under the Name system', () => {
    for (const entry of batch().incompletePlayerFills) {
      for (const skill of entry.startingSkills) {
        const ref = 'skill' in skill ? skill.skill : skill;
        expect(ref.system).toBe('Name');
        expect(ref.id).not.toBe('Loner');
      }
    }
  });
});

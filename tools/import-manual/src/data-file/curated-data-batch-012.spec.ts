import { describe, expect, it } from 'vitest';

import {
  BATCH_001,
  BATCH_007,
  BATCH_008,
  BATCH_009,
  BATCH_010,
  BATCH_011,
  BATCH_012,
  listBatches,
  readBatch,
} from './curated-data.test-helpers';

/** The incomplete TP players whose only trophy awards grant no skill. */
const NON_GRANTING_TROPHY_HOLDERS = new Set([
  '1233621',
  '1245163',
  '869393',
  '607539',
  '595518',
]);

describe('curated batch 012 trophy skill grants', () => {
  const batch = () => readBatch(BATCH_012);

  it('holds the trophy grant, the player fills and the systems they reference', () => {
    const sections = Object.entries(batch())
      .filter(([, entries]) => entries.length > 0)
      .map(([section]) => section)
      .sort();

    expect(sections).toEqual([
      'externalSystems',
      'incompletePlayerFills',
      'trophies',
    ]);
  });

  it('fills each TP player at most once, and none an earlier batch filled', () => {
    const ids = batch().incompletePlayerFills.map((entry) => entry.player.id);
    const earlier = new Set(
      [BATCH_007, BATCH_008, BATCH_009, BATCH_010, BATCH_011].flatMap((name) =>
        readBatch(name).incompletePlayerFills.map((entry) => entry.player.id),
      ),
    );

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => earlier.has(id))).toEqual([]);
  });

  it('fills only players whose trophy awards grant no skill', () => {
    for (const entry of batch().incompletePlayerFills) {
      expect(NON_GRANTING_TROPHY_HOLDERS.has(entry.player.id)).toBe(true);
    }
  });

  it('names every skill under the Name system', () => {
    for (const entry of batch().incompletePlayerFills) {
      for (const skill of entry.startingSkills) {
        const ref = 'skill' in skill ? skill.skill : skill;
        expect(ref.system).toBe('Name');
      }
      for (const advancement of entry.advancements) {
        if ('skill' in advancement) {
          expect(advancement.skill.system).toBe('Name');
        }
      }
    }
  });

  it('restates Gudarnas Förkämpe exactly as batch 001 curates it, granting a skill', () => {
    const seeded = readBatch(BATCH_001).trophies.find(
      (trophy) => trophy.name === 'Gudarnas Förkämpe',
    );

    expect(seeded).toBeDefined();
    expect(batch().trophies).toEqual([{ ...seeded, grantsSkill: true }]);
  });

  it('states no skill grant in any earlier batch', () => {
    for (const name of listBatches().filter((other) => other < BATCH_012)) {
      for (const trophy of readBatch(name).trophies) {
        expect(trophy.grantsSkill).toBeUndefined();
      }
    }
  });
});

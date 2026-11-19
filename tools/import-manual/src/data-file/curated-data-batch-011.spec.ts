import { describe, expect, it } from 'vitest';

import {
  BATCH_007,
  BATCH_008,
  BATCH_009,
  BATCH_010,
  BATCH_011,
  readBatch,
} from './curated-data.test-helpers';

/** The TP players whose feed reports named more than one stored player. */
const TOLD_APART = new Set([
  '342210',
  '342214',
  '342988',
  '343001',
  '343002',
  '345454',
  '345463',
  '520681',
  '586218',
  '520683',
  '870140',
  '684982',
  '999976',
  '1236404',
  '648827',
  '678120',
  '706877',
  '735288',
  '794834',
  '819728',
  '819730',
  '819731',
  '995697',
  '1363571',
  '1363572',
]);

describe('curated batch 011 TP feed fills told apart', () => {
  const batch = () => readBatch(BATCH_011);

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
      [BATCH_007, BATCH_008, BATCH_009, BATCH_010].flatMap((name) =>
        readBatch(name).incompletePlayerFills.map((entry) => entry.player.id),
      ),
    );

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => earlier.has(id))).toEqual([]);
  });

  it('fills only players the feed matched to more than one stored player', () => {
    for (const entry of batch().incompletePlayerFills) {
      expect(TOLD_APART.has(entry.player.id)).toBe(true);
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
});

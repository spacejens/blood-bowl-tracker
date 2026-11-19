import { describe, expect, it } from 'vitest';

import {
  BATCH_001,
  BATCH_012,
  listBatches,
  readBatch,
} from './curated-data.test-helpers';

describe('curated batch 012 trophy skill grants', () => {
  const batch = () => readBatch(BATCH_012);

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

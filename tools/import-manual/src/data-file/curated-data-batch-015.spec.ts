import { describe, expect, it } from 'vitest';

import {
  BATCH_001,
  BATCH_015,
  listBatches,
  readBatch,
  readRawBatch,
} from './curated-data.test-helpers';
import type { ManualDataFile } from './manual-data-file.schema';

type RulesSetEntry = ManualDataFile['rulesSets'][number];

/** Under CRP, CRP+ and BB2016 lasting injuries never heal; under the newer rules sets they can. */
const NEVER_HEAL: Record<string, boolean> = {
  CRP: true,
  'CRP+': true,
  BB2016: true,
  BB2020: false,
  DB2021: false,
  BB2025: false,
};

const identity = ({ name, externalIds }: RulesSetEntry) => ({
  name,
  externalIds,
});

describe('curated batch 015 rules set lasting injuries', () => {
  const batch = () => readBatch(BATCH_015);

  it('holds only rules sets and the systems they reference', () => {
    expect(Object.keys(readRawBatch(BATCH_015)).sort()).toEqual([
      'externalSystems',
      'rulesSets',
    ]);
  });

  it('restates every rules set batch 001 curates, by the same name and external ids', () => {
    expect(batch().rulesSets.map(identity)).toEqual(
      readBatch(BATCH_001).rulesSets.map(identity),
    );
  });

  it('states nothing but name, externalIds and lastingInjuriesNeverHeal', () => {
    for (const entry of readRawBatch(BATCH_015).rulesSets) {
      expect(Object.keys(entry).sort()).toEqual([
        'externalIds',
        'lastingInjuriesNeverHeal',
        'name',
      ]);
    }
  });

  it('flags CRP, CRP+ and BB2016 as never healing and the newer rules sets as possibly healing', () => {
    expect(
      Object.fromEntries(
        batch().rulesSets.map((entry) => [
          entry.name,
          entry.lastingInjuriesNeverHeal,
        ]),
      ),
    ).toEqual(NEVER_HEAL);
  });

  it('states lasting-injury healing in no earlier batch', () => {
    for (const name of listBatches().filter((other) => other < BATCH_015)) {
      for (const rulesSet of readBatch(name).rulesSets) {
        expect(rulesSet.lastingInjuriesNeverHeal).toBeUndefined();
      }
    }
  });
});

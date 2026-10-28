import { describe, expect, it } from 'vitest';

import {
  BATCH_004,
  listBatches,
  readBatch,
  readFile,
} from './curated-data.test-helpers';

const FILE = 'position-skill-categories.json5';

/**
 * The rules sets no importer supplies categories for, so batch 004 curates
 * every regular position whose characteristics are curated. Grows by one
 * rules set per curation task.
 */
const FULLY_CURATED_RULES_SETS = ['CRP', 'CRP+', 'BB2016'];

/** Every (position, rules set) pair any batch curates characteristics for. */
function curatedCharacteristicPairs(): Set<string> {
  const pairs = new Set<string>();
  for (const batch of listBatches()) {
    for (const entry of readBatch(batch).positionRulesSets) {
      pairs.add(`${entry.position.id}|${entry.rulesSet.id}`);
    }
  }
  return pairs;
}

describe('curated batch 004 position skill categories', () => {
  const file = readFile(BATCH_004, FILE);
  const entries = file.positionRulesSetSkillCategories;

  it('references positions and rules sets under the Name system', () => {
    expect(
      entries.every(
        (e) => e.position.system === 'Name' && e.rulesSet.system === 'Name',
      ),
    ).toBe(true);
  });

  it('declares the Name external system itself', () => {
    expect(file.externalSystems.map((s) => s.name)).toContain('Name');
  });

  it('curates each pair once', () => {
    const keys = entries.map((e) => `${e.position.id}|${e.rulesSet.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only curates fully-curated-rules-set pairs whose characteristics are curated', () => {
    const pairs = curatedCharacteristicPairs();
    const orphans = entries
      .filter((e) => FULLY_CURATED_RULES_SETS.includes(e.rulesSet.id))
      .map((e) => `${e.position.id}|${e.rulesSet.id}`)
      .filter((key) => !pairs.has(key));
    expect(orphans).toEqual([]);
  });

  it.each(FULLY_CURATED_RULES_SETS)(
    'curates every %s position that has curated characteristics',
    (rulesSet) => {
      const curated = new Set(
        entries
          .filter((e) => e.rulesSet.id === rulesSet)
          .map((e) => e.position.id),
      );
      const suffix = `|${rulesSet}`;
      const missing = [...curatedCharacteristicPairs()]
        .filter((key) => key.endsWith(suffix))
        .map((key) => key.slice(0, -suffix.length))
        .filter((position) => !curated.has(position));
      expect(missing).toEqual([]);
    },
  );

  it.each(FULLY_CURATED_RULES_SETS)(
    'gives every %s position a primary category and never devious',
    (rulesSet) => {
      const rows = entries.filter((e) => e.rulesSet.id === rulesSet);
      expect(rows.filter((e) => e.primary.length === 0)).toEqual([]);
      expect(
        rows.filter((e) => [...e.primary, ...e.secondary].includes('devious')),
      ).toEqual([]);
    },
  );
});

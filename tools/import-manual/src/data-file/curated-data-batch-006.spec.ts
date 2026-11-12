import { describe, expect, it } from 'vitest';

import {
  BATCH_001,
  BATCH_002,
  BATCH_006,
  readBatch,
  readFile,
} from './curated-data.test-helpers';
import type {
  ExternalRef,
  PositionRulesSetSkillRef,
} from './manual-data-file.schema';

/** A starting skill is either a bare ExternalRef or a `{skill, attributeValue}` wrapper. */
function skillRef(item: PositionRulesSetSkillRef): ExternalRef {
  return 'skill' in item ? item.skill : item;
}

const name = (id: string): ExternalRef => ({ system: 'Name', id });

describe('curated batch 006 BB2016 Gutter Runner skills', () => {
  const batch = () => readBatch(BATCH_006);

  it('holds only starting skills and the Name system they use', () => {
    const sections = Object.entries(batch())
      .filter(([, entries]) => entries.length > 0)
      .map(([section]) => section)
      .sort();

    expect(sections).toEqual(['externalSystems', 'positionRulesSetSkills']);
    expect(batch().externalSystems).toEqual([
      { name: 'Name', category: 'bookkeeping' },
    ]);
  });

  it('gives Skaven: Gutter Runner Dodge and Weeping Dagger under BB2016', () => {
    expect(
      batch().positionRulesSetSkills.map((entry) => ({
        position: entry.position,
        rulesSet: entry.rulesSet,
        skills: entry.skills.map(skillRef),
      })),
    ).toEqual([
      {
        position: name('Skaven: Gutter Runner'),
        rulesSet: name('BB2016'),
        skills: [name('Dodge'), name('Weeping Dagger')],
      },
    ]);
  });

  it('restates every skill batch 002 gave the pair, so the entry is the whole list', () => {
    const earlier = readFile(
      BATCH_002,
      'position-skills.json5',
    ).positionRulesSetSkills.find(
      (entry) =>
        entry.position.id === 'Skaven: Gutter Runner' &&
        entry.rulesSet.id === 'BB2016',
    );

    expect(earlier).toBeDefined();
    const now = batch().positionRulesSetSkills.flatMap((entry) =>
      entry.skills.map((skill) => skillRef(skill).id),
    );
    expect(now).toEqual(
      expect.arrayContaining(
        (earlier?.skills ?? []).map((skill) => skillRef(skill).id),
      ),
    );
  });

  it('names only pairs batch 002 curates characteristics for', () => {
    const pairs = new Set(
      readFile(
        BATCH_002,
        'position-characteristics.json5',
      ).positionRulesSets.map(
        (entry) => `${entry.position.id}|${entry.rulesSet.id}`,
      ),
    );

    for (const entry of batch().positionRulesSetSkills) {
      // The API rejects a starting skill for a pair with no characteristics.
      expect(pairs).toContain(`${entry.position.id}|${entry.rulesSet.id}`);
    }
  });

  it('names only skills batch 001 categorises for that rules set', () => {
    const curated = new Set(
      readFile(BATCH_001, 'skills.json5').skillRulesSets.map(
        (entry) => `${entry.skill.id}|${entry.rulesSet.id}`,
      ),
    );

    for (const entry of batch().positionRulesSetSkills) {
      for (const skill of entry.skills) {
        // The API rejects a starting skill the rules set does not have.
        expect(curated).toContain(`${skillRef(skill).id}|${entry.rulesSet.id}`);
      }
    }
  });
});

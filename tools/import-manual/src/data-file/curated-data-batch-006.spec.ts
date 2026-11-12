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

const RULES_SETS = ['CRP', 'CRP+', 'BB2016'];

describe('curated batch 006 Gutter Runner Weeping Dagger', () => {
  const batch = () => readBatch(BATCH_006);

  it('holds only starting skills, the skill categories they need and the Name system', () => {
    const sections = Object.entries(batch())
      .filter(([, entries]) => entries.length > 0)
      .map(([section]) => section)
      .sort();

    expect(sections).toEqual([
      'externalSystems',
      'positionRulesSetSkills',
      'skillRulesSets',
    ]);
    // Each of the batch's two files declares the Name system it references.
    expect(
      new Set(batch().externalSystems.map((system) => system.name)),
    ).toEqual(new Set(['Name']));
    expect(
      batch().externalSystems.every(
        (system) => system.category === 'bookkeeping',
      ),
    ).toBe(true);
  });

  it('gives Skaven: Gutter Runner Dodge and Weeping Dagger under CRP, CRP+ and BB2016', () => {
    expect(
      batch().positionRulesSetSkills.map((entry) => ({
        position: entry.position,
        rulesSet: entry.rulesSet,
        skills: entry.skills.map(skillRef),
      })),
    ).toEqual(
      RULES_SETS.map((rulesSet) => ({
        position: name('Skaven: Gutter Runner'),
        rulesSet: name(rulesSet),
        skills: [name('Dodge'), name('Weeping Dagger')],
      })),
    );
  });

  it('categorises Weeping Dagger as a trait for CRP and CRP+, the rules sets batch 001 lacks it for', () => {
    expect(
      batch().skillRulesSets.map((entry) => ({
        skill: entry.skill,
        rulesSet: entry.rulesSet,
        category: entry.category,
        isElite: entry.isElite,
      })),
    ).toEqual([
      {
        skill: name('Weeping Dagger'),
        rulesSet: name('CRP'),
        category: 'trait',
        isElite: false,
      },
      {
        skill: name('Weeping Dagger'),
        rulesSet: name('CRP+'),
        category: 'trait',
        isElite: false,
      },
    ]);
    const earlier = readFile(BATCH_001, 'skills.json5').skillRulesSets.filter(
      (entry) => entry.skill.id === 'Weeping Dagger',
    );

    expect(earlier.map((entry) => entry.rulesSet.id)).toEqual(['BB2016']);
  });

  it('restates every skill batch 002 gave each pair, so each entry is the whole list', () => {
    const earlierEntries = readFile(
      BATCH_002,
      'position-skills.json5',
    ).positionRulesSetSkills;

    for (const entry of batch().positionRulesSetSkills) {
      const earlier = earlierEntries.find(
        (candidate) =>
          candidate.position.id === entry.position.id &&
          candidate.rulesSet.id === entry.rulesSet.id,
      );

      expect(earlier).toBeDefined();
      expect(entry.skills.map((skill) => skillRef(skill).id)).toEqual(
        expect.arrayContaining(
          (earlier?.skills ?? []).map((skill) => skillRef(skill).id),
        ),
      );
    }
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

  it('names only skills categorised for that rules set by batch 001 or by this batch', () => {
    const curated = new Set(
      [
        ...readFile(BATCH_001, 'skills.json5').skillRulesSets,
        ...batch().skillRulesSets,
      ].map((entry) => `${entry.skill.id}|${entry.rulesSet.id}`),
    );

    for (const entry of batch().positionRulesSetSkills) {
      for (const skill of entry.skills) {
        // The API rejects a starting skill the rules set does not have.
        expect(curated).toContain(`${skillRef(skill).id}|${entry.rulesSet.id}`);
      }
    }
  });
});

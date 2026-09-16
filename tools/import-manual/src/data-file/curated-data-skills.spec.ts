import { describe, expect, it } from 'vitest';

import { readFile } from './curated-data.test-helpers';

describe('curated data files - skills', () => {
  const skillsFile = () => readFile('before-other-importers', 'skills.json5');

  it('registers the Name external system it references', () => {
    expect(skillsFile().externalSystems).toContainEqual({
      name: 'Name',
      category: 'bookkeeping',
    });
  });

  it('gives every declared skill a Name external id equal to its name', () => {
    const data = skillsFile();

    expect(data.skills.length).toBeGreaterThan(0);
    for (const skill of data.skills) {
      // The source importers upsert a skill under exactly this id, so a
      // mismatch here would silently create a second row for the same skill.
      expect(skill.externalIds).toContainEqual({
        system: 'Name',
        id: skill.name,
      });
    }
  });

  it('references every skill and rules set through the Name system', () => {
    const data = skillsFile();

    expect(data.skillRulesSets.length).toBeGreaterThan(0);
    for (const entry of data.skillRulesSets) {
      expect(entry.skill.system).toBe('Name');
      expect(entry.rulesSet.system).toBe('Name');
    }
  });

  it('declares each (skill, rules set) pair at most once', () => {
    const seen = new Set<string>();

    for (const entry of skillsFile().skillRulesSets) {
      const key = `${entry.skill.id}|${entry.rulesSet.id}`;
      // The API rejects a batch naming the same pair twice, which would cost
      // every other category row in the same call.
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('curates a category for every CRP skill it declares', () => {
    const crp = skillsFile().skillRulesSets.filter(
      (entry) => entry.rulesSet.id === 'CRP',
    );

    expect(crp.length).toBeGreaterThan(0);
  });

  it('pre-registers every skill referenced by skillRulesSets, not just CRP-only skills', () => {
    const data = skillsFile();
    const skillNames = new Set(data.skills.map((skill) => skill.name));

    // before-other-importers runs as its own, earlier invocation than
    // BBL/TP import (see docs/import-manual/index.md), and
    // ExternalIdResolverService.resolve is a pure lookup with no fallback.
    // A skillRulesSets row referencing a skill this file never registers
    // (e.g. "Block", normally created by BBL/TP's own upsert) would
    // silently fail to resolve and drop that category row as an
    // ImportError on a from-empty-database run.
    for (const entry of data.skillRulesSets) {
      expect(skillNames.has(entry.skill.id)).toBe(true);
    }
  });
});

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

  it('curates categories for CRP+ and BB2016 as well as CRP', () => {
    const byRulesSet = new Map<string, number>();
    for (const entry of skillsFile().skillRulesSets) {
      byRulesSet.set(
        entry.rulesSet.id,
        (byRulesSet.get(entry.rulesSet.id) ?? 0) + 1,
      );
    }

    expect(byRulesSet.get('CRP')).toBeGreaterThan(0);
    expect(byRulesSet.get('CRP+')).toBeGreaterThan(0);
    expect(byRulesSet.get('BB2016')).toBeGreaterThan(0);
  });

  it('curates categories for the modern rules sets the source importers write', () => {
    const rulesSets = new Set(
      skillsFile().skillRulesSets.map((entry) => entry.rulesSet.id),
    );

    expect(rulesSets).toContain('BB2020');
    expect(rulesSets).toContain('DB2021');
    expect(rulesSets).toContain('BB2025');
  });

  it('classifies at least one skill as unique, for star players', () => {
    const unique = skillsFile().skillRulesSets.filter(
      (entry) => entry.category === 'unique',
    );

    expect(unique.length).toBeGreaterThan(0);
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

  const positionSkillsFile = () =>
    readFile('after-other-importers', 'position-skills.json5');

  it('references positions, rules sets and skills through the Name system', () => {
    const data = positionSkillsFile();

    expect(data.positionRulesSetSkills.length).toBeGreaterThan(0);
    for (const entry of data.positionRulesSetSkills) {
      expect(entry.position.system).toBe('Name');
      expect(entry.rulesSet.system).toBe('Name');
      for (const skill of entry.skills) {
        expect(skill.system).toBe('Name');
      }
    }
  });

  it('only curates pairs that already have curated characteristics', () => {
    const pairs = new Set(
      readFile(
        'after-other-importers',
        'position-characteristics.json5',
      ).positionRulesSets.map(
        (entry) => `${entry.position.id}|${entry.rulesSet.id}`,
      ),
    );

    for (const entry of positionSkillsFile().positionRulesSetSkills) {
      // position_rules_set_skills hangs off the position_rules_sets row, so
      // the API rejects any pair with no characteristics recorded.
      expect(pairs).toContain(`${entry.position.id}|${entry.rulesSet.id}`);
    }
  });

  it('names only skills the curated category table gives that rules set', () => {
    const curated = new Set(
      readFile('before-other-importers', 'skills.json5').skillRulesSets.map(
        (entry) => `${entry.skill.id}|${entry.rulesSet.id}`,
      ),
    );

    for (const entry of positionSkillsFile().positionRulesSetSkills) {
      for (const skill of entry.skills) {
        // The API rejects a starting skill the rules set does not have.
        expect(curated).toContain(`${skill.id}|${entry.rulesSet.id}`);
      }
    }
  });

  it('lists each (position, rules set) at most once and repeats no skill within one', () => {
    const seen = new Set<string>();

    for (const entry of positionSkillsFile().positionRulesSetSkills) {
      const key = `${entry.position.id}|${entry.rulesSet.id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const ids = entry.skills.map((skill) => skill.id);
      // The API rejects a batch repeating the same triple.
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('curates CRP starting skills', () => {
    const crp = positionSkillsFile().positionRulesSetSkills.filter(
      (entry) => entry.rulesSet.id === 'CRP',
    );

    expect(crp.length).toBeGreaterThan(0);
  });

  it('curates CRP+ starting skills', () => {
    const crpPlus = positionSkillsFile().positionRulesSetSkills.filter(
      (entry) => entry.rulesSet.id === 'CRP+',
    );

    expect(crpPlus.length).toBeGreaterThan(0);
  });

  it('curates BB2016 starting skills', () => {
    const bb2016 = positionSkillsFile().positionRulesSetSkills.filter(
      (entry) => entry.rulesSet.id === 'BB2016',
    );

    expect(bb2016.length).toBeGreaterThan(0);
  });

  it('curates all three older rules sets and nothing newer', () => {
    const rulesSets = new Set(
      positionSkillsFile().positionRulesSetSkills.map(
        (entry) => entry.rulesSet.id,
      ),
    );

    // BB2020/DB2021/BB2025 come from BBL and TP; curating them here would
    // duplicate what those importers already write.
    expect([...rulesSets].sort()).toEqual(['BB2016', 'CRP', 'CRP+']);
  });

  it('curates exactly the rules sets BblPositionSkillsImportService excludes itself from', () => {
    const rulesSets = new Set(
      positionSkillsFile().positionRulesSetSkills.map(
        (entry) => entry.rulesSet.id,
      ),
    );

    // Cross-referenced with tools/import-bbl's
    // "pins CURATION_OWNED_RULES_SET_NAMES to the exact list
    // curated-data-skills.spec.ts expects" test in
    // bbl-position-skills-import.service.spec.ts, which imports and asserts
    // on the real CURATION_OWNED_RULES_SET_NAMES constant. Not imported here
    // directly: tools/import-manual declares no dependency on
    // tools/import-bbl, so this side hardcodes the same list and drift is
    // caught by a human keeping the two in sync, not by the compiler. This
    // guards against the exact bug class the Critical fix in this branch
    // resolved -- a rules set curated here without BBL's exclusion list
    // knowing about it, or vice versa. Together, the two tests catch drift in
    // either direction: this one catches a name removed from the curated
    // side, the other catches a name added to BBL's exclusion list.
    const CURATION_OWNED_RULES_SET_NAMES = ['CRP', 'CRP+', 'BB2016'];
    expect([...rulesSets].sort()).toEqual(
      [...CURATION_OWNED_RULES_SET_NAMES].sort(),
    );
  });

  it('curates the Stunty Leeg races CRP itself does not list', () => {
    const ids = new Set(
      positionSkillsFile().positionRulesSetSkills.map(
        (entry) => entry.position.id,
      ),
    );

    // All six Stunty Leeg rosters need at least one curated starting-skill
    // position, since none of them appear in CRP itself.
    const stuntyLeegRaces = [
      'SL - Albion Fae: ',
      'SL - Chaos Halflings: ',
      'SL - Goblin Cheaters: ',
      'SL - Horrors Of Tzeentch: ',
      'SL - Pygmies: ',
      'SL - Skinks: ',
    ];
    for (const prefix of stuntyLeegRaces) {
      expect([...ids].some((id) => id.startsWith(prefix))).toBe(true);
    }
  });
});

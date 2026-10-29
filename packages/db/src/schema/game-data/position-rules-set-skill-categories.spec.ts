import { SKILL_ACCESS_LEVELS } from '@blood-bowl-tracker/domain-enums';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  positionRulesSetSkillCategories,
  skillAccessEnum,
} from './position-rules-set-skill-categories';
import { positionRulesSets } from './position-rules-sets';

describe('position_rules_set_skill_categories', () => {
  const config = getTableConfig(positionRulesSetSkillCategories);
  const byName = new Map(config.columns.map((c) => [c.name, c]));

  it('lives in the game_data schema under its own name', () => {
    expect(config.schema).toBe('game_data');
    expect(config.name).toBe('position_rules_set_skill_categories');
  });

  it('has non-null anchor, category, access and removed columns', () => {
    for (const name of [
      'position_rules_set_id',
      'skill_category',
      'access',
      'removed',
    ]) {
      expect(byName.get(name)?.notNull).toBe(true);
    }
  });

  it('defaults removed to false', () => {
    expect(byName.get('removed')?.default).toBe(false);
  });

  it('uses the shared domain-enums access list', () => {
    expect(skillAccessEnum.enumName).toBe('skill_access');
    expect(skillAccessEnum.enumValues).toEqual(SKILL_ACCESS_LEVELS);
  });

  it('references position_rules_sets', () => {
    const fk = config.foreignKeys.find((f) =>
      f.reference().columns.some((c) => c.name === 'position_rules_set_id'),
    );
    expect(fk).toBeDefined();
    expect(fk!.reference().foreignTable).toBe(positionRulesSets);
  });

  it('is unique on (position_rules_set_id, skill_category)', () => {
    const constraint = config.uniqueConstraints.find(
      (c) =>
        c.name === 'position_rules_set_skill_categories_anchor_category_unique',
    );
    expect(constraint).toBeDefined();
    expect(constraint!.columns.map((c) => c.name)).toEqual([
      'position_rules_set_id',
      'skill_category',
    ]);
  });
});

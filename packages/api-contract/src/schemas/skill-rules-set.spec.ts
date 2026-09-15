import { describe, expect, it } from 'vitest';

import {
  ListSkillRulesSetsSchema,
  SkillCategorySchema,
  SkillRulesSetEntrySchema,
  SyncSkillRulesSetsResultSchema,
  SyncSkillRulesSetsSchema,
} from './skill-rules-set';

describe('skill rules set schemas', () => {
  it('parses an entry naming a category', () => {
    const parsed = SkillRulesSetEntrySchema.parse({
      skillId: 7,
      rulesSetId: 4,
      category: 'general',
    });
    expect(parsed.category).toBe('general');
  });

  it('rejects a category outside the closed set', () => {
    expect(
      SkillRulesSetEntrySchema.safeParse({
        skillId: 7,
        rulesSetId: 4,
        category: 'sneaky',
      }).success,
    ).toBe(false);
  });

  it('accepts BB2025 devious and trait categories', () => {
    expect(SkillCategorySchema.safeParse('devious').success).toBe(true);
    expect(SkillCategorySchema.safeParse('trait').success).toBe(true);
  });

  it('parses an empty sync batch', () => {
    expect(SyncSkillRulesSetsSchema.parse({ entries: [] })).toEqual({
      entries: [],
    });
  });

  it('parses a sync result', () => {
    expect(
      SyncSkillRulesSetsResultSchema.parse({ skillRulesSetIds: [1, 2] }),
    ).toEqual({ skillRulesSetIds: [1, 2] });
  });

  it('requires a skill id to list', () => {
    expect(ListSkillRulesSetsSchema.safeParse({}).success).toBe(false);
  });
});

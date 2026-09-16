import { describe, expect, it } from 'vitest';

import {
  ListPositionRulesSetSkillsSchema,
  PositionRulesSetSkillEntrySchema,
  PositionRulesSetSkillRefSchema,
  SyncPositionRulesSetSkillsResultSchema,
  SyncPositionRulesSetSkillsSchema,
} from './position-rules-set-skill';

describe('position rules set skill schemas', () => {
  it('parses an entry', () => {
    const parsed = PositionRulesSetSkillEntrySchema.parse({
      positionId: 3,
      rulesSetId: 4,
      skillId: 7,
    });
    expect(parsed.skillId).toBe(7);
  });

  it('parses an entry with an attribute value', () => {
    const parsed = PositionRulesSetSkillEntrySchema.parse({
      positionId: 3,
      rulesSetId: 4,
      skillId: 7,
      attributeValue: '4+',
    });
    expect(parsed.attributeValue).toBe('4+');
  });

  it('parses an empty sync batch', () => {
    expect(SyncPositionRulesSetSkillsSchema.parse({ entries: [] })).toEqual({
      entries: [],
    });
  });

  it('parses a sync result', () => {
    expect(
      SyncPositionRulesSetSkillsResultSchema.parse({
        positionRulesSetSkillIds: [5],
      }),
    ).toEqual({ positionRulesSetSkillIds: [5] });
  });

  it('parses one listed starting skill', () => {
    expect(
      PositionRulesSetSkillRefSchema.parse({
        rulesSetId: 4,
        skillId: 7,
      }).skillId,
    ).toBe(7);
  });

  it('parses one listed starting skill with an attribute value', () => {
    expect(
      PositionRulesSetSkillRefSchema.parse({
        rulesSetId: 4,
        skillId: 7,
        attributeValue: 'Orc Linemen',
      }).attributeValue,
    ).toBe('Orc Linemen');
  });

  it('requires a position id to list', () => {
    expect(ListPositionRulesSetSkillsSchema.safeParse({}).success).toBe(false);
  });
});

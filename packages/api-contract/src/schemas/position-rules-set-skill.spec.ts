import { describe, expect, it } from 'vitest';

import {
  ListPositionRulesSetSkillsSchema,
  PositionRulesSetSkillEntrySchema,
  PositionRulesSetSkillRefSchema,
  SyncPositionRulesSetSkillsResultSchema,
  SyncPositionRulesSetSkillsSchema,
} from './position-rules-set-skill';

describe('position rules set skill schemas', () => {
  it('parses an entry and defaults the star-player-unique flag to false', () => {
    const parsed = PositionRulesSetSkillEntrySchema.parse({
      positionId: 3,
      rulesSetId: 4,
      skillId: 7,
    });
    expect(parsed.isStarPlayerUniqueSkill).toBe(false);
  });

  it('parses an entry that marks a star player unique skill', () => {
    const parsed = PositionRulesSetSkillEntrySchema.parse({
      positionId: 3,
      rulesSetId: 4,
      skillId: 7,
      isStarPlayerUniqueSkill: true,
    });
    expect(parsed.isStarPlayerUniqueSkill).toBe(true);
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
        isStarPlayerUniqueSkill: false,
      }).skillId,
    ).toBe(7);
  });

  it('requires a position id to list', () => {
    expect(ListPositionRulesSetSkillsSchema.safeParse({}).success).toBe(false);
  });
});

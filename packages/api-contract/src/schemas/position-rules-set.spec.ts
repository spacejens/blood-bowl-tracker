import { describe, expect, it } from 'vitest';

import {
  PositionRulesSetEntrySchema,
  SyncPositionRulesSetsResultSchema,
  SyncPositionRulesSetsSchema,
} from './position-rules-set';

describe('position rules set schemas', () => {
  it('parses an entry with every characteristic', () => {
    const parsed = PositionRulesSetEntrySchema.parse({
      positionId: 3,
      rulesSetId: 4,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    });
    expect(parsed.passing).toBe(4);
  });

  it('parses an entry whose rules set has no Passing characteristic', () => {
    const parsed = PositionRulesSetEntrySchema.parse({
      positionId: 3,
      rulesSetId: 4,
      move: 6,
      strength: 3,
      agility: 3,
      passing: null,
      armour: 9,
    });
    expect(parsed.passing).toBeNull();
  });

  it('requires passing to be stated, as null rather than omitted', () => {
    expect(() =>
      PositionRulesSetEntrySchema.parse({
        positionId: 3,
        rulesSetId: 4,
        move: 6,
        strength: 3,
        agility: 3,
        armour: 9,
      }),
    ).toThrow();
  });

  it('rejects a non-integer characteristic', () => {
    expect(() =>
      PositionRulesSetEntrySchema.parse({
        positionId: 3,
        rulesSetId: 4,
        move: 6.5,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 9,
      }),
    ).toThrow();
  });

  it('wraps entries in the sync input and ids in the sync result', () => {
    expect(SyncPositionRulesSetsSchema.parse({ entries: [] })).toEqual({
      entries: [],
    });
    expect(
      SyncPositionRulesSetsResultSchema.parse({ positionRulesSetIds: [1, 2] }),
    ).toEqual({ positionRulesSetIds: [1, 2] });
  });
});

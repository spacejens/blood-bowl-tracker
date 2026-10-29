import { describe, expect, it } from 'vitest';

import {
  PositionSkillCategoriesSchema,
  SyncPositionRulesSetSkillCategoriesSchema,
} from './position-rules-set-skill-category';

describe('SyncPositionRulesSetSkillCategoriesSchema', () => {
  const entry = {
    positionId: 1,
    rulesSetId: 2,
    primary: ['general'],
    secondary: ['agility', 'strength'],
  };

  it('accepts a pair with primary and secondary categories', () => {
    expect(
      SyncPositionRulesSetSkillCategoriesSchema.safeParse({ entries: [entry] })
        .success,
    ).toBe(true);
  });

  it('accepts empty primary and secondary lists', () => {
    expect(
      PositionSkillCategoriesSchema.safeParse({ primary: [], secondary: [] })
        .success,
    ).toBe(true);
  });

  it('accepts trait at the boundary, leaving the rejection to the service', () => {
    expect(
      PositionSkillCategoriesSchema.safeParse({
        primary: ['trait'],
        secondary: [],
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown category name', () => {
    expect(
      PositionSkillCategoriesSchema.safeParse({
        primary: ['magic'],
        secondary: [],
      }).success,
    ).toBe(false);
  });

  it('rejects an entry missing secondary', () => {
    expect(
      SyncPositionRulesSetSkillCategoriesSchema.safeParse({
        entries: [{ positionId: 1, rulesSetId: 2, primary: [] }],
      }).success,
    ).toBe(false);
  });
});

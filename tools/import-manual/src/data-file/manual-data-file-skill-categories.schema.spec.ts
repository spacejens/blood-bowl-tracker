import { describe, expect, it } from 'vitest';

import { ManualDataFileSchema } from './manual-data-file.schema';

const entry = {
  position: { system: 'Name', id: 'Human: Lineman' },
  rulesSet: { system: 'Name', id: 'CRP' },
  primary: ['general'],
  secondary: ['agility', 'strength'],
};

describe('ManualDataFileSchema positionRulesSetSkillCategories', () => {
  it('defaults the section to an empty array', () => {
    expect(
      ManualDataFileSchema.parse({}).positionRulesSetSkillCategories,
    ).toEqual([]);
  });

  it('accepts a pair with learnable primary and secondary categories', () => {
    expect(
      ManualDataFileSchema.parse({ positionRulesSetSkillCategories: [entry] })
        .positionRulesSetSkillCategories,
    ).toEqual([entry]);
  });

  it('accepts an empty primary list', () => {
    expect(
      ManualDataFileSchema.safeParse({
        positionRulesSetSkillCategories: [{ ...entry, primary: [] }],
      }).success,
    ).toBe(true);
  });

  it.each(['trait', 'unique'])('rejects %s', (category) => {
    expect(
      ManualDataFileSchema.safeParse({
        positionRulesSetSkillCategories: [{ ...entry, primary: [category] }],
      }).success,
    ).toBe(false);
  });

  it('rejects a category that is both primary and secondary', () => {
    const result = ManualDataFileSchema.safeParse({
      positionRulesSetSkillCategories: [
        { ...entry, primary: ['general'], secondary: ['general'] },
      ],
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      'lists a skill category more than once',
    );
  });

  it('rejects a category repeated within one list', () => {
    expect(
      ManualDataFileSchema.safeParse({
        positionRulesSetSkillCategories: [
          { ...entry, primary: ['general', 'general'], secondary: [] },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects an entry missing secondary', () => {
    expect(
      ManualDataFileSchema.safeParse({
        positionRulesSetSkillCategories: [
          { position: entry.position, rulesSet: entry.rulesSet, primary: [] },
        ],
      }).success,
    ).toBe(false);
  });
});

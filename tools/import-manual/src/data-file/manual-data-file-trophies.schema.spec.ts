import { describe, expect, it } from 'vitest';

import { ManualDataFileSchema } from './manual-data-file.schema';

const entry = {
  name: 'Gudarnas Förkämpe',
  recipientKind: 'player',
  awardRuleKind: 'manual',
  awardProcedure: 'Rolled by hand.',
  externalIds: [{ system: 'tloeg.bbleague.se', id: 'Gudarnas Förkämpe' }],
};

describe('ManualDataFileSchema trophies grantsSkill', () => {
  it('accepts a trophy stated as granting a skill', () => {
    expect(
      ManualDataFileSchema.parse({
        trophies: [{ ...entry, grantsSkill: true }],
      }).trophies[0].grantsSkill,
    ).toBe(true);
  });

  it('leaves an omitted grant undefined rather than defaulting it', () => {
    expect(
      ManualDataFileSchema.parse({ trophies: [entry] }).trophies[0].grantsSkill,
    ).toBeUndefined();
  });

  it('rejects a grant that is not a boolean', () => {
    expect(
      ManualDataFileSchema.safeParse({
        trophies: [{ ...entry, grantsSkill: 'yes' }],
      }).success,
    ).toBe(false);
  });
});

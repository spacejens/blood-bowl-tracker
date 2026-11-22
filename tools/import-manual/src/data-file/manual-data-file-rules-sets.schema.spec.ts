import { describe, expect, it } from 'vitest';

import { ManualDataFileSchema } from './manual-data-file.schema';

const entry = {
  name: 'CRP',
  externalIds: [{ system: 'Name', id: 'CRP' }],
};

describe('ManualDataFileSchema rulesSets lastingInjuriesNeverHeal', () => {
  it('accepts a rules set stated as never healing', () => {
    expect(
      ManualDataFileSchema.parse({
        rulesSets: [{ ...entry, lastingInjuriesNeverHeal: true }],
      }).rulesSets[0].lastingInjuriesNeverHeal,
    ).toBe(true);
  });

  it('leaves an omitted flag undefined rather than defaulting it', () => {
    expect(
      ManualDataFileSchema.parse({ rulesSets: [entry] }).rulesSets[0]
        .lastingInjuriesNeverHeal,
    ).toBeUndefined();
  });

  it('rejects a flag that is not a boolean', () => {
    expect(
      ManualDataFileSchema.safeParse({
        rulesSets: [{ ...entry, lastingInjuriesNeverHeal: 'yes' }],
      }).success,
    ).toBe(false);
  });
});

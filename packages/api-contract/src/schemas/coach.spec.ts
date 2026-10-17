import { describe, expect, it } from 'vitest';

import { UpsertCoachSchema } from './coach';

describe('coach schemas', () => {
  it('keeps an explicit rename intent rather than stripping it', () => {
    expect(
      UpsertCoachSchema.parse({
        name: 'Andreas G',
        renameExisting: true,
        externalIds: [{ externalSystemId: 1, externalId: 'Andreas' }],
      }).renameExisting,
    ).toBe(true);
  });
});

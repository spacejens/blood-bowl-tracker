import { describe, expect, it } from 'vitest';

import { UpsertTeamSchema } from './team';

describe('team schemas', () => {
  it('keeps an explicit rename intent rather than stripping it', () => {
    expect(
      UpsertTeamSchema.parse({
        name: 'Gyttjevrålarna FC',
        renameExisting: true,
        externalIds: [{ externalSystemId: 1, externalId: '40g' }],
      }).renameExisting,
    ).toBe(true);
  });
});

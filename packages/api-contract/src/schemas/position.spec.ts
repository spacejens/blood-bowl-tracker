import { describe, expect, it } from 'vitest';

import { UpsertPositionSchema } from './position';

describe('position schemas', () => {
  it('keeps an explicit rename intent rather than stripping it', () => {
    expect(
      UpsertPositionSchema.parse({
        name: 'Ogre Blocker',
        renameExisting: true,
        externalIds: [
          { externalSystemId: 1, externalId: 'Ogre: Ogre Blocker' },
        ],
      }).renameExisting,
    ).toBe(true);
  });
});

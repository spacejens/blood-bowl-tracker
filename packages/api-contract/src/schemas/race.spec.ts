import { describe, expect, it } from 'vitest';

import { RaceSchema, UpsertRaceSchema } from './race';

describe('race schemas', () => {
  it('RaceSchema parses eras as a number array', () => {
    const parsed = RaceSchema.parse({
      id: 1,
      name: 'Orc',
      eras: [5, 6],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.eras).toEqual([5, 6]);
  });

  it('UpsertRaceSchema defaults eras to an empty array when omitted', () => {
    const parsed = UpsertRaceSchema.parse({
      name: 'Orc',
      externalIds: [{ externalSystemId: 1, externalId: 'Orc' }],
    });
    expect(parsed.eras).toEqual([]);
  });
});

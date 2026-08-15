import { describe, expect, it } from 'vitest';

import { TrophySchema, UpsertTrophySchema } from './trophy';

describe('trophy schemas', () => {
  it('accepts a full trophy with a description', () => {
    const parsed = TrophySchema.parse({
      id: 7,
      name: 'Chaos Cup',
      recipientKind: 'team',
      description: 'The team that wins after four matches.',
      competitionGroupId: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.recipientKind).toBe('team');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('accepts a trophy with a null description', () => {
    const parsed = TrophySchema.parse({
      id: 8,
      name: 'Ogretoberfest',
      recipientKind: 'team',
      description: null,
      competitionGroupId: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.description).toBeNull();
  });

  it('rejects an unknown recipient kind', () => {
    const parsed = TrophySchema.safeParse({
      id: 9,
      name: 'Nope',
      recipientKind: 'coach',
      description: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts an upsert with an EMPTY externalIds array', () => {
    const parsed = UpsertTrophySchema.parse({
      name: 'Ogretoberfest',
      recipientKind: 'team',
      externalIds: [],
    });
    expect(parsed.externalIds).toEqual([]);
  });

  it('defaults externalIds to an empty array when omitted', () => {
    const parsed = UpsertTrophySchema.parse({ name: 'Korpen' });
    expect(parsed.externalIds).toEqual([]);
  });

  it('accepts a rename-only upsert carrying just externalIds and a name', () => {
    const parsed = UpsertTrophySchema.parse({
      name: 'Major 1st',
      externalIds: [{ externalSystemId: 1, externalId: 'Major 1st' }],
    });
    expect(parsed.recipientKind).toBeUndefined();
    expect(parsed.description).toBeUndefined();
  });

  it('accepts an explicit null description to clear a stored one', () => {
    const parsed = UpsertTrophySchema.parse({
      description: null,
      externalIds: [{ externalSystemId: 1, externalId: 'Korpen' }],
    });
    expect(parsed.description).toBeNull();
  });

  it('accepts an optional competitionGroupId on upsert', () => {
    expect(
      UpsertTrophySchema.parse({ name: 'Major Gold', competitionGroupId: 2 })
        .competitionGroupId,
    ).toBe(2);
    expect(
      UpsertTrophySchema.parse({ name: 'Major Gold' }).competitionGroupId,
    ).toBeUndefined();
  });
});

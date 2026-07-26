import { describe, expect, it } from 'vitest';

import { LeagueSchema, UpsertLeagueSchema } from './league';

describe('league schemas', () => {
  it('LeagueSchema parses a valid league', () => {
    const parsed = LeagueSchema.parse({
      id: 1,
      name: 'tLoEG',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.name).toBe('tLoEG');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('UpsertLeagueSchema rejects an empty name', () => {
    expect(() =>
      UpsertLeagueSchema.parse({
        name: '',
        externalIds: [{ externalSystemId: 1, externalId: 'x' }],
      }),
    ).toThrow();
  });

  it('UpsertLeagueSchema rejects an empty externalIds array', () => {
    expect(() =>
      UpsertLeagueSchema.parse({ name: 'X', externalIds: [] }),
    ).toThrow();
  });

  it('UpsertLeagueSchema accepts an externalIds-only payload', () => {
    const parsed = UpsertLeagueSchema.parse({
      externalIds: [{ externalSystemId: 1, externalId: 'x' }],
    });
    expect(parsed.name).toBeUndefined();
  });
});

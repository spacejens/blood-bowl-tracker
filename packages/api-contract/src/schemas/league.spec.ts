import { describe, it, expect } from 'vitest';
import { LeagueSchema, UpsertLeagueSchema } from './league';

describe('league schemas', () => {
  it('LeagueSchema parses a valid league', () => {
    const parsed = LeagueSchema.parse({
      id: 1,
      name: 'The League of Extraordinary Gentlemen',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.name).toBe('The League of Extraordinary Gentlemen');
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
});

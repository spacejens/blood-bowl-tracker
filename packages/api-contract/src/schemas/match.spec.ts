import { describe, expect, it } from 'vitest';

import { MATCH_CATEGORIES, MatchSchema, UpsertMatchSchema } from './match';

describe('UpsertMatchSchema', () => {
  const valid = {
    competitionId: 1,
    playedAt: new Date('2021-09-25'),
    name: 'Final',
    externalIds: [{ externalSystemId: 1, externalId: '89' }],
  };

  it('accepts a match with a name', () => {
    const parsed = UpsertMatchSchema.parse(valid);
    expect(parsed.name).toBe('Final');
    expect(parsed.teamEraIds).toEqual([]);
  });

  it('accepts a match with no name', () => {
    const { name, ...withoutName } = valid;
    void name;
    const parsed = UpsertMatchSchema.parse(withoutName);
    expect(parsed.name).toBeUndefined();
  });

  it('UpsertMatchSchema accepts an externalIds-only payload', () => {
    const parsed = UpsertMatchSchema.parse({
      externalIds: [{ externalSystemId: 1, externalId: '89' }],
    });
    expect(parsed.name).toBeUndefined();
    expect(parsed.competitionId).toBeUndefined();
    expect(parsed.playedAt).toBeUndefined();
    expect(parsed.teamEraIds).toEqual([]);
  });
});

describe('MatchSchema', () => {
  it('includes the name field', () => {
    const parsed = MatchSchema.parse({
      id: 1,
      competitionId: 2,
      teamEraIds: [],
      name: 'Semifinal',
      category: 'season_semi_final',
      playedAt: new Date('2021-09-25'),
      createdAt: new Date('2026-01-01'),
    });
    expect(parsed.name).toBe('Semifinal');
  });
});

describe('UpsertMatchSchema category', () => {
  const base = {
    externalIds: [{ externalSystemId: 1, externalId: '1830' }],
  };

  it('accepts every known category', () => {
    for (const category of MATCH_CATEGORIES) {
      expect(UpsertMatchSchema.parse({ ...base, category }).category).toBe(
        category,
      );
    }
  });

  it('rejects an unknown category', () => {
    expect(() =>
      UpsertMatchSchema.parse({ ...base, category: 'unknown' }),
    ).toThrow();
  });

  it('leaves category undefined when the payload omits it', () => {
    expect(UpsertMatchSchema.parse(base).category).toBeUndefined();
  });
});

describe('MatchSchema category', () => {
  it('requires a category on a read model', () => {
    expect(() =>
      MatchSchema.parse({
        id: 1,
        competitionId: 2,
        teamEraIds: [],
        name: 'Final',
        playedAt: new Date('2026-06-13T00:00:00Z'),
        createdAt: new Date('2026-06-13T00:00:00Z'),
      }),
    ).toThrow();
  });
});

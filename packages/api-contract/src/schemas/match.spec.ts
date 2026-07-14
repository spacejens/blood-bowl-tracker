import { describe, expect, it } from 'vitest';

import { MatchSchema, UpsertMatchSchema } from './match';

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

  it('rejects a match with no name', () => {
    const { name, ...withoutName } = valid;
    void name;
    expect(() => UpsertMatchSchema.parse(withoutName)).toThrow();
  });
});

describe('MatchSchema', () => {
  it('includes the name field', () => {
    const parsed = MatchSchema.parse({
      id: 1,
      competitionId: 2,
      teamEraIds: [],
      name: 'Semifinal',
      playedAt: new Date('2021-09-25'),
      createdAt: new Date('2026-01-01'),
    });
    expect(parsed.name).toBe('Semifinal');
  });
});

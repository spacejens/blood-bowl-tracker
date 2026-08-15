import { describe, expect, it } from 'vitest';

import { TrophyAwardSchema, UpsertTrophyAwardSchema } from './trophy-award';

describe('TrophyAwardSchema', () => {
  it('accepts a team award with a null playerId', () => {
    const parsed = TrophyAwardSchema.parse({
      id: 1,
      trophyId: 2,
      competitionId: 3,
      teamEraId: 4,
      playerId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.playerId).toBeNull();
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('accepts a player award', () => {
    expect(
      TrophyAwardSchema.parse({
        id: 1,
        trophyId: 2,
        competitionId: 3,
        teamEraId: 4,
        playerId: 5,
        createdAt: new Date('2026-01-01'),
      }).playerId,
    ).toBe(5);
  });
});

describe('UpsertTrophyAwardSchema', () => {
  it('defaults playerId to null when omitted', () => {
    expect(
      UpsertTrophyAwardSchema.parse({
        trophyId: 2,
        competitionId: 3,
        teamEraId: 4,
      }),
    ).toEqual({
      trophyId: 2,
      competitionId: 3,
      teamEraId: 4,
      playerId: null,
    });
  });

  it('keeps an explicit playerId', () => {
    expect(
      UpsertTrophyAwardSchema.parse({
        trophyId: 2,
        competitionId: 3,
        teamEraId: 4,
        playerId: 5,
      }).playerId,
    ).toBe(5);
  });

  it('rejects a payload missing the required link ids', () => {
    expect(() =>
      UpsertTrophyAwardSchema.parse({ trophyId: 2, competitionId: 3 }),
    ).toThrow();
  });

  it('rejects a non-integer id', () => {
    expect(() =>
      UpsertTrophyAwardSchema.parse({
        trophyId: 2.5,
        competitionId: 3,
        teamEraId: 4,
      }),
    ).toThrow();
  });
});

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
      grantedSkillId: null,
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
        grantedSkillId: null,
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

  it('accepts a player award that omits teamEraId', () => {
    expect(
      UpsertTrophyAwardSchema.parse({
        trophyId: 2,
        competitionId: 3,
        playerId: 5,
      }),
    ).toEqual({ trophyId: 2, competitionId: 3, playerId: 5 });
  });

  it('rejects a team award that omits teamEraId', () => {
    expect(() =>
      UpsertTrophyAwardSchema.parse({
        trophyId: 2,
        competitionId: 3,
        playerId: null,
      }),
    ).toThrow();
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

describe('TrophyAwardSchema granted skill', () => {
  it('returns the granted skill', () => {
    expect(
      TrophyAwardSchema.parse({
        id: 1,
        trophyId: 2,
        competitionId: 3,
        teamEraId: 4,
        playerId: 5,
        grantedSkillId: 6,
        createdAt: new Date('2026-01-01'),
      }).grantedSkillId,
    ).toBe(6);
  });

  it('rejects a row without the field', () => {
    expect(
      TrophyAwardSchema.safeParse({
        id: 1,
        trophyId: 2,
        competitionId: 3,
        teamEraId: 4,
        playerId: 5,
        createdAt: new Date('2026-01-01'),
      }).success,
    ).toBe(false);
  });
});

describe('UpsertTrophyAwardSchema granted skill', () => {
  it('leaves grantedSkillId out when omitted, so the stored value stays', () => {
    const parsed = UpsertTrophyAwardSchema.parse({
      trophyId: 2,
      competitionId: 3,
      playerId: 5,
    });
    expect(parsed).not.toHaveProperty('grantedSkillId');
  });

  it('accepts a granted skill id', () => {
    expect(
      UpsertTrophyAwardSchema.parse({
        trophyId: 2,
        competitionId: 3,
        playerId: 5,
        grantedSkillId: 6,
      }).grantedSkillId,
    ).toBe(6);
  });

  it('accepts null, which clears a stored granted skill', () => {
    expect(
      UpsertTrophyAwardSchema.parse({
        trophyId: 2,
        competitionId: 3,
        playerId: 5,
        grantedSkillId: null,
      }).grantedSkillId,
    ).toBeNull();
  });

  it('rejects a non-integer granted skill id', () => {
    expect(
      UpsertTrophyAwardSchema.safeParse({
        trophyId: 2,
        competitionId: 3,
        playerId: 5,
        grantedSkillId: 1.5,
      }).success,
    ).toBe(false);
  });
});

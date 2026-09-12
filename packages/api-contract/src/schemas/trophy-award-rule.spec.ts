import { describe, expect, it } from 'vitest';

import {
  ComputeMissingTrophyAwardsResultSchema,
  ComputeMissingTrophyAwardsSchema,
} from './trophy-award-rule';

describe('ComputeMissingTrophyAwardsSchema', () => {
  it('accepts a competition id', () => {
    expect(
      ComputeMissingTrophyAwardsSchema.parse({ competitionId: 3 }),
    ).toEqual({ competitionId: 3 });
  });

  it('rejects a non-integer competition id', () => {
    expect(() =>
      ComputeMissingTrophyAwardsSchema.parse({ competitionId: 1.5 }),
    ).toThrow();
  });
});

describe('ComputeMissingTrophyAwardsResultSchema', () => {
  it('carries what the call did', () => {
    expect(
      ComputeMissingTrophyAwardsResultSchema.parse({
        competitionId: 3,
        createdAwardCount: 2,
        awardedTrophyIds: [10, 11],
      }),
    ).toEqual({
      competitionId: 3,
      createdAwardCount: 2,
      awardedTrophyIds: [10, 11],
    });
  });
});

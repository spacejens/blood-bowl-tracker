import { describe, it, expect } from 'vitest';
import { TeamEraSchema, CreateTeamEraSchema } from './index';

describe('index', () => {
  it('exports TeamEraSchema', () => {
    expect(
      TeamEraSchema.safeParse({
        id: 1,
        teamId: 2,
        eraId: 3,
        createdAt: new Date(),
      }).success,
    ).toBe(true);
  });

  it('exports CreateTeamEraSchema', () => {
    expect(CreateTeamEraSchema.safeParse({ teamId: 2, eraId: 3 }).success).toBe(
      true,
    );
  });
});

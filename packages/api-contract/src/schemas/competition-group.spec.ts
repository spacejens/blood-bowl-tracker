import { describe, expect, it } from 'vitest';

import {
  CompetitionGroupListSchema,
  CompetitionGroupSchema,
  UpsertCompetitionGroupSchema,
} from './competition-group';

describe('CompetitionGroupSchema', () => {
  it('parses a full competition group', () => {
    const parsed = CompetitionGroupSchema.parse({
      id: 1,
      name: 'Major Season',
      leagueId: 4,
      createdAt: '2026-08-14T00:00:00.000Z',
    });
    expect(parsed.name).toBe('Major Season');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });
});

describe('UpsertCompetitionGroupSchema', () => {
  it('requires both name and leagueId', () => {
    expect(
      UpsertCompetitionGroupSchema.safeParse({ name: 'Chaos Cup' }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({ leagueId: 1 }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({ name: '', leagueId: 1 }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.parse({ name: 'Chaos Cup', leagueId: 1 }),
    ).toEqual({ name: 'Chaos Cup', leagueId: 1 });
  });
});

describe('CompetitionGroupListSchema', () => {
  it('parses id/name pairs', () => {
    expect(
      CompetitionGroupListSchema.parse([{ id: 1, name: 'Major Season' }]),
    ).toEqual([{ id: 1, name: 'Major Season' }]);
  });
});

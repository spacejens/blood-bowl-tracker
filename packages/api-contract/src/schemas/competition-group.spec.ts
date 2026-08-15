import { describe, expect, it } from 'vitest';

import {
  CompetitionGroupSchema,
  UpsertCompetitionGroupSchema,
} from './competition-group';

const externalIds = [{ externalSystemId: 2, externalId: 'Major Season' }];

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
  it('requires name, leagueId and at least one external id', () => {
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: 'Chaos Cup',
        externalIds,
      }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({ leagueId: 1, externalIds })
        .success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: '',
        leagueId: 1,
        externalIds,
      }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({ name: 'Chaos Cup', leagueId: 1 })
        .success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: 'Chaos Cup',
        leagueId: 1,
        externalIds: [],
      }).success,
    ).toBe(false);
  });

  it('parses a fully specified upsert', () => {
    expect(
      UpsertCompetitionGroupSchema.parse({
        name: 'Chaos Cup',
        leagueId: 1,
        externalIds,
      }),
    ).toEqual({ name: 'Chaos Cup', leagueId: 1, externalIds });
  });
});

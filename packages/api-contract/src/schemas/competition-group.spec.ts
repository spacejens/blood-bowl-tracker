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
  const namePattern = '^Chaos Cup$';

  it('requires name, leagueId, namePattern and at least one external id', () => {
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: 'Chaos Cup',
        namePattern,
        externalIds,
      }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        leagueId: 1,
        namePattern,
        externalIds,
      }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: '',
        leagueId: 1,
        namePattern,
        externalIds,
      }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: 'Chaos Cup',
        leagueId: 1,
        externalIds,
      }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: 'Chaos Cup',
        leagueId: 1,
        namePattern,
      }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: 'Chaos Cup',
        leagueId: 1,
        namePattern,
        externalIds: [],
      }).success,
    ).toBe(false);
  });

  it('parses a fully specified upsert', () => {
    expect(
      UpsertCompetitionGroupSchema.parse({
        name: 'Chaos Cup',
        leagueId: 1,
        namePattern,
        externalIds,
      }),
    ).toEqual({ name: 'Chaos Cup', leagueId: 1, namePattern, externalIds });
  });

  it('rejects a null or empty name pattern', () => {
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: 'Chaos Cup',
        leagueId: 1,
        namePattern: null,
        externalIds,
      }).success,
    ).toBe(false);
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: 'Chaos Cup',
        leagueId: 1,
        namePattern: '',
        externalIds,
      }).success,
    ).toBe(false);
  });

  it('rejects a name pattern that is not a valid regular expression', () => {
    expect(
      UpsertCompetitionGroupSchema.safeParse({
        name: 'Chaos Cup',
        leagueId: 1,
        namePattern: '^Chaos (Cup',
        externalIds,
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  COMPETITION_TYPES,
  CompetitionSchema,
  UpsertCompetitionSchema,
} from './competition';

describe('competition schemas', () => {
  it('CompetitionSchema parses a competition with both dates set', () => {
    const parsed = CompetitionSchema.parse({
      id: 1,
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      teamEraIds: [100, 101],
      startDate: '2024-01-15',
      endDate: '2024-06-30',
      competitionGroupId: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.startDate).toBe('2024-01-15');
    expect(parsed.endDate).toBe('2024-06-30');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('CompetitionSchema parses a null endDate', () => {
    const parsed = CompetitionSchema.parse({
      id: 1,
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      teamEraIds: [],
      startDate: '2024-01-15',
      endDate: null,
      competitionGroupId: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.startDate).toBe('2024-01-15');
    expect(parsed.endDate).toBeNull();
  });

  it('CompetitionSchema rejects a null startDate', () => {
    const result = CompetitionSchema.safeParse({
      id: 1,
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      teamEraIds: [],
      startDate: null,
      endDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain('startDate');
  });

  it('UpsertCompetitionSchema accepts valid ISO dates', () => {
    const parsed = UpsertCompetitionSchema.parse({
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      teamEraIds: [100],
      startDate: '2024-01-15',
      endDate: '2024-06-30',
      externalIds: [{ externalSystemId: 1, externalId: '73' }],
    });
    expect(parsed.startDate).toBe('2024-01-15');
    expect(parsed.endDate).toBe('2024-06-30');
  });

  it('UpsertCompetitionSchema rejects a non-ISO startDate', () => {
    expect(() =>
      UpsertCompetitionSchema.parse({
        name: 'X',
        startDate: '15-01-2024',
        externalIds: [{ externalSystemId: 1, externalId: '73' }],
      }),
    ).toThrow();
  });

  it('UpsertCompetitionSchema rejects a non-ISO endDate', () => {
    expect(() =>
      UpsertCompetitionSchema.parse({
        name: 'X',
        endDate: 'June 2024',
        externalIds: [{ externalSystemId: 1, externalId: '73' }],
      }),
    ).toThrow();
  });

  it('UpsertCompetitionSchema distinguishes an explicit null endDate from an omitted one', () => {
    const cleared = UpsertCompetitionSchema.parse({
      endDate: null,
      externalIds: [{ externalSystemId: 1, externalId: '73' }],
    });
    const omitted = UpsertCompetitionSchema.parse({
      externalIds: [{ externalSystemId: 1, externalId: '73' }],
    });
    expect(cleared.endDate).toBeNull();
    expect(omitted.endDate).toBeUndefined();
    expect(omitted.startDate).toBeUndefined();
  });

  it('UpsertCompetitionSchema rejects an explicit null startDate — a competition always has a start date', () => {
    const result = UpsertCompetitionSchema.safeParse({
      startDate: null,
      externalIds: [{ externalSystemId: 1, externalId: '73' }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toContain('startDate');
  });

  it('UpsertCompetitionSchema accepts an externalIds-only rename payload', () => {
    const parsed = UpsertCompetitionSchema.parse({
      name: 'Renamed competition',
      externalIds: [{ externalSystemId: 1, externalId: '73' }],
    });
    expect(parsed.eraId).toBeUndefined();
    expect(parsed.startDate).toBeUndefined();
    expect(parsed.endDate).toBeUndefined();
    expect(parsed.teamEraIds).toEqual([]);
  });

  it('UpsertCompetitionSchema rejects an empty externalIds array', () => {
    expect(() =>
      UpsertCompetitionSchema.parse({
        name: 'X',
        externalIds: [],
      }),
    ).toThrow();
  });

  it('accepts an optional competitionGroupId on upsert', () => {
    expect(
      UpsertCompetitionSchema.parse({
        externalIds: [{ externalSystemId: 1, externalId: '7' }],
        competitionGroupId: 3,
      }).competitionGroupId,
    ).toBe(3);
    expect(
      UpsertCompetitionSchema.parse({
        externalIds: [{ externalSystemId: 1, externalId: '7' }],
      }).competitionGroupId,
    ).toBeUndefined();
  });
});

describe('COMPETITION_TYPES', () => {
  it('lists every competition type, in the same order as the db enum', () => {
    expect(COMPETITION_TYPES).toEqual(['season', 'cup']);
  });

  it('is the vocabulary CompetitionSchema.type accepts', () => {
    for (const type of COMPETITION_TYPES) {
      expect(
        CompetitionSchema.parse({
          id: 1,
          name: 'Major Season 24',
          type,
          eraId: 20,
          teamEraIds: [],
          startDate: '2024-01-15',
          endDate: null,
          competitionGroupId: 3,
          createdAt: '2024-01-01T00:00:00.000Z',
        }).type,
      ).toBe(type);
    }
  });

  it('is the vocabulary UpsertCompetitionSchema.type accepts', () => {
    for (const type of COMPETITION_TYPES) {
      expect(
        UpsertCompetitionSchema.parse({
          type,
          externalIds: [{ externalSystemId: 1, externalId: 'c-1' }],
        }).type,
      ).toBe(type);
    }
  });

  it('rejects a type outside the tuple', () => {
    expect(() =>
      UpsertCompetitionSchema.parse({
        type: 'friendly',
        externalIds: [{ externalSystemId: 1, externalId: 'c-1' }],
      }),
    ).toThrow();
  });
});

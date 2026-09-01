import { describe, expect, it } from 'vitest';

import { RaceEraEntrySchema, SyncPositionRaceErasSchema } from './position';

describe('RaceEraEntrySchema', () => {
  it('accepts an availability-only entry with no characteristics', () => {
    const parsed = RaceEraEntrySchema.parse({ raceId: 1, eraId: 2 });

    expect(parsed).toEqual({ raceId: 1, eraId: 2 });
    expect(parsed.characteristics).toBeUndefined();
  });

  it('accepts an entry carrying characteristics', () => {
    const parsed = RaceEraEntrySchema.parse({
      raceId: 1,
      eraId: 2,
      characteristics: {
        rulesSetId: 7,
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
      },
    });

    expect(parsed.characteristics?.rulesSetId).toBe(7);
    expect(parsed.characteristics?.passing).toBe(4);
  });

  it('accepts an explicit null passing, for a rules set with no Passing', () => {
    const parsed = RaceEraEntrySchema.parse({
      raceId: 1,
      eraId: 2,
      characteristics: {
        rulesSetId: 7,
        move: 6,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 9,
      },
    });

    expect(parsed.characteristics?.passing).toBeNull();
  });

  it('rejects characteristics with passing omitted entirely', () => {
    expect(() =>
      RaceEraEntrySchema.parse({
        raceId: 1,
        eraId: 2,
        characteristics: {
          rulesSetId: 7,
          move: 6,
          strength: 3,
          agility: 3,
          armour: 9,
        },
      }),
    ).toThrow();
  });

  it('rejects characteristics with no rulesSetId to validate against', () => {
    expect(() =>
      RaceEraEntrySchema.parse({
        raceId: 1,
        eraId: 2,
        characteristics: {
          move: 6,
          strength: 3,
          agility: 3,
          passing: null,
          armour: 9,
        },
      }),
    ).toThrow();
  });
});

describe('SyncPositionRaceErasSchema', () => {
  it('carries a mix of entries with and without characteristics', () => {
    const parsed = SyncPositionRaceErasSchema.parse({
      positionId: 5,
      raceEras: [
        { raceId: 1, eraId: 2 },
        {
          raceId: 1,
          eraId: 3,
          characteristics: {
            rulesSetId: 7,
            move: 6,
            strength: 3,
            agility: 3,
            passing: null,
            armour: 9,
          },
        },
      ],
    });

    expect(parsed.raceEras).toHaveLength(2);
    expect(parsed.raceEras[0].characteristics).toBeUndefined();
    expect(parsed.raceEras[1].characteristics?.armour).toBe(9);
  });
});

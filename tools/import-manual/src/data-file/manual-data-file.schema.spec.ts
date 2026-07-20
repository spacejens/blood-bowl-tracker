import { describe, expect, it } from 'vitest';

import { ManualDataFileSchema } from './manual-data-file.schema';

describe('ManualDataFileSchema', () => {
  it('accepts an empty object and fills every section with an empty array', () => {
    const result = ManualDataFileSchema.parse({});
    expect(result).toEqual({
      externalSystems: [],
      rulesSets: [],
      leagues: [],
      eras: [],
      races: [],
      positions: [],
      coaches: [],
      teams: [],
    });
  });

  it('accepts a mixed file with an era plus its race and position', () => {
    const parsed = ManualDataFileSchema.parse({
      eras: [
        {
          name: 'Season 12',
          league: { system: 'Name', id: 'name:my-league' },
          rulesSets: [{ system: 'Name', id: 'name:crp' }],
          startDate: '2024-01-01',
          externalIds: [{ system: 'Name', id: 'name:season-12' }],
        },
      ],
      races: [
        {
          name: 'Necromantic Horror',
          eras: [{ system: 'Name', id: 'name:season-12' }],
          externalIds: [
            { system: 'BBL', id: 'id:47' },
            { system: 'Name', id: 'name:necromantic-horror' },
          ],
        },
      ],
      positions: [
        {
          name: 'Zombie',
          isStarPlayer: false,
          raceEras: [
            {
              race: { system: 'Name', id: 'name:necromantic-horror' },
              era: { system: 'Name', id: 'name:season-12' },
            },
          ],
          externalIds: [{ system: 'Name', id: 'name:zombie' }],
        },
      ],
    });
    expect(parsed.eras[0].endDate).toBeUndefined();
    expect(parsed.races[0].eras).toHaveLength(1);
    expect(parsed.positions[0].raceEras).toHaveLength(1);
  });

  it('defaults races.eras and positions.raceEras to empty arrays', () => {
    const parsed = ManualDataFileSchema.parse({
      races: [{ name: 'Amazon', externalIds: [{ system: 'Name', id: 'name:amazon' }] }],
      positions: [
        {
          name: 'Blitzer',
          isStarPlayer: false,
          externalIds: [{ system: 'Name', id: 'name:blitzer' }],
        },
      ],
    });
    expect(parsed.races[0].eras).toEqual([]);
    expect(parsed.positions[0].raceEras).toEqual([]);
  });

  it('rejects an entry with no external IDs', () => {
    expect(() =>
      ManualDataFileSchema.parse({ coaches: [{ name: 'Bob', externalIds: [] }] }),
    ).toThrow();
  });

  it('rejects an external ref missing system or id', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        leagues: [{ name: 'L', externalIds: [{ system: 'Name' }] }],
      }),
    ).toThrow();
  });

  it('rejects a non-ISO startDate on an era', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        eras: [
          {
            name: 'E',
            league: { system: 'Name', id: 'name:l' },
            rulesSets: [{ system: 'Name', id: 'name:crp' }],
            startDate: '01-01-2024',
            externalIds: [{ system: 'Name', id: 'name:e' }],
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects an unknown top-level section key', () => {
    expect(() =>
      ManualDataFileSchema.parse({ players: [] }),
    ).toThrow();
  });

  it('rejects a team missing its race reference', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        teams: [
          {
            name: 'T',
            coach: { system: 'Name', id: 'name:c' },
            externalIds: [{ system: 'Name', id: 'name:t' }],
          },
        ],
      }),
    ).toThrow();
  });
});

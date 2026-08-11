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
      competitions: [],
      sppAwardValues: [],
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
      races: [
        {
          name: 'Amazon',
          externalIds: [{ system: 'Name', id: 'name:amazon' }],
        },
      ],
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
      ManualDataFileSchema.parse({
        coaches: [{ name: 'Bob', externalIds: [] }],
      }),
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
    expect(() => ManualDataFileSchema.parse({ players: [] })).toThrow();
  });

  it('accepts a competition with its era reference and type', () => {
    const parsed = ManualDataFileSchema.parse({
      competitions: [
        {
          name: 'Major Season 12',
          type: 'season',
          era: { system: 'Name', id: 'name:season-12' },
          externalIds: [
            { system: 'BBL', id: 'id:35' },
            { system: 'Name', id: 'name:season-12-comp' },
          ],
        },
      ],
    });
    expect(parsed.competitions[0].type).toBe('season');
    expect(parsed.competitions[0].era).toEqual({
      system: 'Name',
      id: 'name:season-12',
    });
    expect(parsed.competitions[0].externalIds).toHaveLength(2);
  });

  it('rejects a competition with an unknown type', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        competitions: [
          {
            name: 'C',
            type: 'tournament',
            era: { system: 'Name', id: 'name:e' },
            externalIds: [{ system: 'Name', id: 'name:c' }],
          },
        ],
      }),
    ).toThrow();
  });

  it('accepts a rename-only competition entry with no era and no type', () => {
    const parsed = ManualDataFileSchema.parse({
      competitions: [
        {
          name: 'Major Season 12',
          externalIds: [{ system: 'tloeg.bbleague.se', id: '35' }],
        },
      ],
    });
    expect(parsed.competitions[0].era).toBeUndefined();
    expect(parsed.competitions[0].type).toBeUndefined();
  });

  it('accepts a rename-only era entry with no league, rules sets or dates', () => {
    const parsed = ManualDataFileSchema.parse({
      eras: [
        {
          name: 'First era',
          externalIds: [{ system: 'Name', id: 'First era' }],
        },
      ],
    });
    expect(parsed.eras[0].league).toBeUndefined();
    expect(parsed.eras[0].startDate).toBeUndefined();
    expect(parsed.eras[0].rulesSets).toEqual([]);
  });

  it('accepts an explicit null endDate on an era, to clear a stored end date', () => {
    const parsed = ManualDataFileSchema.parse({
      eras: [
        {
          name: 'Reopened era',
          endDate: null,
          externalIds: [{ system: 'Name', id: 'Reopened era' }],
        },
      ],
    });
    expect(parsed.eras[0].endDate).toBeNull();
  });

  it('accepts a rename-only team entry with no race or coach', () => {
    const parsed = ManualDataFileSchema.parse({
      teams: [
        { name: 'Renamed Team', externalIds: [{ system: 'Name', id: 'rt' }] },
      ],
    });
    expect(parsed.teams[0].race).toBeUndefined();
    expect(parsed.teams[0].coach).toBeUndefined();
  });

  it('accepts a position entry with no isStarPlayer flag', () => {
    const parsed = ManualDataFileSchema.parse({
      positions: [
        { name: 'Blitzer', externalIds: [{ system: 'Name', id: 'blitzer' }] },
      ],
    });
    expect(parsed.positions[0].isStarPlayer).toBeUndefined();
  });

  it('still requires a name on every entry — it is the entry label used in errors', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        coaches: [{ externalIds: [{ system: 'Name', id: 'bob' }] }],
      }),
    ).toThrow();
  });

  it('parses an sppAwardValues section with a baseline and an override entry', () => {
    const parsed = ManualDataFileSchema.parse({
      sppAwardValues: [
        {
          rulesSet: { system: 'Name', id: 'CRP' },
          actionType: 'touchdown',
          sppValue: 3,
        },
        {
          rulesSet: { system: 'Name', id: 'BB2025' },
          race: { system: 'tloeg.bbleague.se', id: '16' },
          actionType: 'touchdown',
          sppValue: 2,
        },
      ],
    });

    expect(parsed.sppAwardValues).toHaveLength(2);
    expect(parsed.sppAwardValues[0].race).toBeUndefined();
    expect(parsed.sppAwardValues[1].race).toEqual({
      system: 'tloeg.bbleague.se',
      id: '16',
    });
  });

  it('defaults sppAwardValues to an empty array', () => {
    expect(ManualDataFileSchema.parse({}).sppAwardValues).toEqual([]);
  });

  it('rejects an sppAwardValues entry whose action type earns no SPP', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        sppAwardValues: [
          {
            rulesSet: { system: 'Name', id: 'CRP' },
            actionType: 'foul',
            sppValue: 0,
          },
        ],
      }),
    ).toThrow();
  });
});

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
      positionRulesSets: [],
      coaches: [],
      teams: [],
      competitions: [],
      sppAwardValues: [],
      trophies: [],
      competitionGroups: [],
    });
  });

  it('accepts a position/rules-set characteristics entry', () => {
    const parsed = ManualDataFileSchema.parse({
      positionRulesSets: [
        {
          position: { system: 'Name', id: 'Zombie Lineman' },
          rulesSet: { system: 'Name', id: 'BB2025' },
          move: 4,
          strength: 3,
          agility: 4,
          passing: 5,
          armour: 9,
        },
      ],
    });
    expect(parsed.positionRulesSets[0].passing).toBe(5);
  });

  it('defaults the positionRulesSets section to empty', () => {
    expect(ManualDataFileSchema.parse({}).positionRulesSets).toEqual([]);
  });

  it('rejects a characteristics entry with no rules set', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        positionRulesSets: [
          {
            position: { system: 'Name', id: 'Zombie Lineman' },
            move: 4,
            strength: 3,
            agility: 4,
            armour: 9,
          },
        ],
      }),
    ).toThrow();
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
  });

  it('accepts a rules set declaring its characteristic formats', () => {
    const parsed = ManualDataFileSchema.parse({
      rulesSets: [
        {
          name: 'BB2020',
          moveFormat: 'bare',
          strengthFormat: 'bare',
          agilityFormat: 'plus',
          passingFormat: 'plus',
          armourFormat: 'plus',
          externalIds: [{ system: 'Name', id: 'BB2020' }],
        },
      ],
    });
    expect(parsed.rulesSets[0].agilityFormat).toBe('plus');
  });

  it('rejects an unknown characteristic format', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        rulesSets: [
          {
            name: 'BB2020',
            agilityFormat: 'star',
            externalIds: [{ system: 'Name', id: 'BB2020' }],
          },
        ],
      }),
    ).toThrow();
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

  it('accepts a competition with its start and end dates', () => {
    const parsed = ManualDataFileSchema.parse({
      competitions: [
        {
          name: 'Major Season 1',
          type: 'season',
          era: { system: 'Name', id: 'First era' },
          startDate: '2011-09-09',
          endDate: '2011-12-18',
          externalIds: [{ system: 'tloeg.bbleague.se', id: '1' }],
        },
      ],
    });
    expect(parsed.competitions[0].startDate).toBe('2011-09-09');
    expect(parsed.competitions[0].endDate).toBe('2011-12-18');
  });

  it('rejects a competition whose start date is not an ISO date', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        competitions: [
          {
            name: 'C',
            startDate: '9 September 2011',
            externalIds: [{ system: 'Name', id: 'name:c' }],
          },
        ],
      }),
    ).toThrow();
  });

  it('accepts an explicit null endDate on a competition, to clear a stored end date', () => {
    const parsed = ManualDataFileSchema.parse({
      competitions: [
        {
          name: 'Ongoing Cup',
          endDate: null,
          externalIds: [{ system: 'Name', id: 'name:ongoing-cup' }],
        },
      ],
    });
    expect(parsed.competitions[0].endDate).toBeNull();
  });

  it('rejects a competition whose end date is not an ISO date', () => {
    expect(() =>
      ManualDataFileSchema.parse({
        competitions: [
          {
            name: 'C',
            endDate: '18 December 2011',
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
    expect(parsed.competitions[0].startDate).toBeUndefined();
    expect(parsed.competitions[0].endDate).toBeUndefined();
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

  it('accepts a team trophy with a description and one external id', () => {
    const parsed = ManualDataFileSchema.parse({
      trophies: [
        {
          name: 'Chaos Cup',
          recipientKind: 'team',
          description: 'The team that wins after four matches.',
          externalIds: [{ system: 'tloeg.bbleague.se', id: 'Chaos Cup' }],
        },
      ],
    });
    expect(parsed.trophies[0].recipientKind).toBe('team');
    expect(parsed.trophies[0].description).toBe(
      'The team that wins after four matches.',
    );
  });

  it('rejects a trophy with an empty externalIds array', () => {
    const parsed = ManualDataFileSchema.safeParse({
      trophies: [
        { name: 'Ogretoberfest', recipientKind: 'team', externalIds: [] },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a trophy that omits externalIds', () => {
    const parsed = ManualDataFileSchema.safeParse({
      trophies: [{ name: 'Ogretoberfest', recipientKind: 'team' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a player trophy with no description', () => {
    const parsed = ManualDataFileSchema.parse({
      trophies: [
        {
          name: 'Season MVP',
          recipientKind: 'player',
          externalIds: [{ system: 'tloeg.bbleague.se', id: 'Season MVP' }],
        },
      ],
    });
    expect(parsed.trophies[0].description).toBeUndefined();
  });

  it('rejects a trophy with an unknown recipient kind', () => {
    const parsed = ManualDataFileSchema.safeParse({
      trophies: [
        {
          name: 'Nope',
          recipientKind: 'coach',
          externalIds: [{ system: 'tloeg.bbleague.se', id: 'Nope' }],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a trophy with no recipient kind', () => {
    const parsed = ManualDataFileSchema.safeParse({
      trophies: [
        {
          name: 'Nope',
          externalIds: [{ system: 'tloeg.bbleague.se', id: 'Nope' }],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('parses a competition group entry with its league reference', () => {
    const parsed = ManualDataFileSchema.parse({
      competitionGroups: [
        {
          name: 'Major Season',
          league: { system: 'tloeg.bbleague.se', id: 'tLoEG' },
        },
      ],
    });
    expect(parsed.competitionGroups[0].league.id).toBe('tLoEG');
  });

  it('requires a competition group entry to name a league', () => {
    expect(
      ManualDataFileSchema.safeParse({
        competitionGroups: [{ name: 'Major Season' }],
      }).success,
    ).toBe(false);
  });

  it('defaults competitionGroups to an empty array', () => {
    expect(ManualDataFileSchema.parse({}).competitionGroups).toEqual([]);
  });

  it('accepts an optional competitionGroup on trophy and competition entries', () => {
    const parsed = ManualDataFileSchema.parse({
      trophies: [
        {
          name: 'Major Gold',
          recipientKind: 'team',
          competitionGroup: { system: 'Name', id: 'Major Season' },
          externalIds: [{ system: 'tloeg.bbleague.se', id: 'Major Gold' }],
        },
      ],
      competitions: [
        {
          externalIds: [{ system: 'tloeg.bbleague.se', id: '15' }],
          competitionGroup: { system: 'Name', id: 'Korpen' },
        },
      ],
    });
    expect(parsed.trophies[0].competitionGroup).toEqual({
      system: 'Name',
      id: 'Major Season',
    });
    expect(parsed.competitions[0].competitionGroup).toEqual({
      system: 'Name',
      id: 'Korpen',
    });
    expect(parsed.competitions[0].name).toBeUndefined();
  });

  it('accepts a trophy scoped to a league', () => {
    const parsed = ManualDataFileSchema.parse({
      trophies: [
        {
          name: 'Legendary Player',
          recipientKind: 'player',
          league: { system: 'tloeg.bbleague.se', id: 'tLoEG' },
          externalIds: [
            { system: 'tloeg.bbleague.se', id: 'Legendary Player' },
          ],
        },
      ],
    });
    expect(parsed.trophies[0].league).toEqual({
      system: 'tloeg.bbleague.se',
      id: 'tLoEG',
    });
  });
});

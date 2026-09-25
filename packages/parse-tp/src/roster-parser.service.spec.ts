import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { RosterParserService } from './roster-parser.service';

function rosterBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    teamName: 'The Dwarf Team',
    teamRace: 'Dwarf_BB2025',
    player: { applicationUserId: 'guid-coach-1', userNameToShow: 'Coach One' },
    lineUps: [
      {
        id: 2412443,
        name: 'The Agitated Deviation',
        number: 1,
        lineUpMasterId: 952,
        rosterId: 123,
        position: 'Dwarf Lineman',
        isBigGuy: false,
        totalStarPlayerPoints: 23,
      },
    ],
    rosterMaster: {
      name: 'Dwarf',
      starPlayersMasters: [
        {
          id: 5001,
          position: 'Grim Ironjaw',
          ma: 5,
          st: 4,
          ag: 4,
          pa: 5,
          av: 10,
        },
        {
          id: 5002,
          position: "Morg 'n' Thorg",
          ma: 6,
          st: 6,
          ag: 3,
          pa: 4,
          av: 11,
        },
      ],
      lineUpMasters: [
        {
          id: 952,
          position: 'Dwarf Lineman',
          ma: 5,
          st: 3,
          ag: 4,
          pa: 6,
          av: 9,
        },
        {
          id: 953,
          position: 'Dwarf Runner',
          ma: 6,
          st: 3,
          ag: 3,
          pa: 4,
          av: 8,
        },
      ],
    },
    ...overrides,
  };
}

function lineUp(overrides: Record<string, unknown> = {}) {
  return {
    id: 2412443,
    name: 'The Agitated Deviation',
    number: 1,
    lineUpMasterId: 952,
    rosterId: 123,
    position: 'Dwarf Lineman',
    isBigGuy: false,
    totalStarPlayerPoints: 23,
    ...overrides,
  };
}

describe('RosterParserService', () => {
  let service: RosterParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RosterParserService],
    }).compile();
    service = moduleRef.get(RosterParserService);
  });

  it('extracts the roster identity, race, coach and positions', () => {
    expect(service.parse(rosterBody())).toEqual({
      id: 123,
      teamName: 'The Dwarf Team',
      teamRaceCode: 'Dwarf_BB2025',
      raceName: 'Dwarf',
      coachTpId: 'guid-coach-1',
      coachName: 'Coach One',
      positions: [
        {
          tpPositionId: 952,
          name: 'Dwarf Lineman',
          characteristics: {
            move: 5,
            strength: 3,
            agility: 4,
            passing: 6,
            armour: 9,
          },
        },
        {
          tpPositionId: 953,
          name: 'Dwarf Runner',
          characteristics: {
            move: 6,
            strength: 3,
            agility: 3,
            passing: 4,
            armour: 8,
          },
        },
      ],
      starPositions: [
        {
          tpPositionId: 5001,
          name: 'Grim Ironjaw',
          characteristics: {
            move: 5,
            strength: 4,
            agility: 4,
            passing: 5,
            armour: 10,
          },
        },
        {
          tpPositionId: 5002,
          name: "Morg 'n' Thorg",
          characteristics: {
            move: 6,
            strength: 6,
            agility: 3,
            passing: 4,
            armour: 11,
          },
        },
      ],
      players: [
        {
          id: 2412443,
          name: 'The Agitated Deviation',
          number: 1,
          lineUpMasterId: 952,
          rosterId: 123,
          fallbackPositionName: 'Dwarf Lineman',
          isBigGuy: false,
          totalStarPlayerPoints: 23,
        },
      ],
    });
  });

  it('parses each starPlayersMasters entry into a star position', () => {
    const roster = service.parse(rosterBody());
    expect(roster.starPositions).toEqual([
      {
        tpPositionId: 5001,
        name: 'Grim Ironjaw',
        characteristics: {
          move: 5,
          strength: 4,
          agility: 4,
          passing: 5,
          armour: 10,
        },
      },
      {
        tpPositionId: 5002,
        name: "Morg 'n' Thorg",
        characteristics: {
          move: 6,
          strength: 6,
          agility: 3,
          passing: 4,
          armour: 11,
        },
      },
    ]);
  });

  it('returns an empty starPositions array when starPlayersMasters is empty', () => {
    const roster = service.parse(
      rosterBody({
        rosterMaster: {
          name: 'Dwarf',
          starPlayersMasters: [],
          lineUpMasters: [
            {
              id: 952,
              position: 'Dwarf Lineman',
              ma: 5,
              st: 3,
              ag: 4,
              pa: 6,
              av: 9,
            },
          ],
        },
      }),
    );
    expect(roster.starPositions).toEqual([]);
  });

  it('throws a descriptive error naming rosterMaster.name when it is missing', () => {
    expect(() =>
      service.parse(rosterBody({ rosterMaster: { lineUpMasters: [] } })),
    ).toThrow(/rosterMaster\.name/);
  });

  it('throws naming player.applicationUserId when the coach id is missing', () => {
    expect(() => service.parse(rosterBody({ player: {} }))).toThrow(
      /player\.applicationUserId/,
    );
  });

  it("trims the coach's display name", () => {
    const roster = service.parse(
      rosterBody({
        player: {
          applicationUserId: 'guid-coach-1',
          userNameToShow: '  Coach One  ',
        },
      }),
    );
    expect(roster.coachName).toBe('Coach One');
  });

  it('throws naming player.userNameToShow when the coach name is missing', () => {
    expect(() =>
      service.parse(
        rosterBody({ player: { applicationUserId: 'guid-coach-1' } }),
      ),
    ).toThrow(/player\.userNameToShow/);
  });

  it('throws for a non-object body', () => {
    expect(() => service.parse(null)).toThrow(/Invalid TP roster JSON/);
  });

  it('parses each lineUps entry into a player instance', () => {
    const roster = service.parse(rosterBody());
    expect(roster.players).toEqual([
      {
        id: 2412443,
        name: 'The Agitated Deviation',
        number: 1,
        lineUpMasterId: 952,
        rosterId: 123,
        fallbackPositionName: 'Dwarf Lineman',
        isBigGuy: false,
        totalStarPlayerPoints: 23,
      },
    ]);
  });

  it('parses isBigGuy true and a fallback position name for a mercenary-style entry', () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          {
            id: 1399322,
            name: 'Giant',
            number: 20,
            lineUpMasterId: 440,
            rosterId: 123,
            position: 'Giant Mercenary',
            isBigGuy: true,
            totalStarPlayerPoints: 0,
          },
        ],
      }),
    );
    expect(roster.players).toEqual([
      {
        id: 1399322,
        name: 'Giant',
        number: 20,
        lineUpMasterId: 440,
        rosterId: 123,
        fallbackPositionName: 'Giant Mercenary',
        isBigGuy: true,
        totalStarPlayerPoints: 0,
      },
    ]);
  });

  it('defaults isBigGuy to false when the field is absent', () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          {
            id: 2412443,
            name: 'The Agitated Deviation',
            number: 1,
            lineUpMasterId: 952,
            rosterId: 123,
            position: 'Dwarf Lineman',
            totalStarPlayerPoints: 23,
          },
        ],
      }),
    );
    expect(roster.players[0]?.isBigGuy).toBe(false);
  });

  it('returns an empty players array when lineUps is empty', () => {
    expect(service.parse(rosterBody({ lineUps: [] })).players).toEqual([]);
  });

  it('rejects a lineUp missing totalStarPlayerPoints', () => {
    expect(() =>
      service.parse(
        rosterBody({
          lineUps: [
            {
              id: 2412443,
              name: 'The Agitated Deviation',
              number: 1,
              lineUpMasterId: 952,
              rosterId: 123,
              position: 'Dwarf Lineman',
              isBigGuy: false,
            },
          ],
        }),
      ),
    ).toThrow(/totalStarPlayerPoints/);
  });

  it('rejects a fractional totalStarPlayerPoints', () => {
    // Star Player Points are always whole numbers.
    expect(() =>
      service.parse(
        rosterBody({
          lineUps: [
            {
              id: 2412443,
              name: 'The Agitated Deviation',
              number: 1,
              lineUpMasterId: 952,
              rosterId: 123,
              position: 'Dwarf Lineman',
              isBigGuy: false,
              totalStarPlayerPoints: 1.5,
            },
          ],
        }),
      ),
    ).toThrow(/totalStarPlayerPoints/);
  });

  it('parses the per-action-type career counters into careerCounts', () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          {
            id: 2412443,
            name: 'The Agitated Deviation',
            number: 1,
            lineUpMasterId: 952,
            rosterId: 123,
            position: 'Dwarf Lineman',
            isBigGuy: false,
            totalStarPlayerPoints: 23,
            totalTouchdowns: 12,
            totalPass: 4,
            totalInterceptions: 2,
            totalMVP: 3,
            totalCasualties: 5,
          },
        ],
      }),
    );
    expect(roster.players[0]?.careerCounts).toEqual({
      touchdowns: 12,
      completions: 4,
      interceptions: 2,
      mvpAwards: 3,
      casualties: 5,
    });
  });

  it('leaves careerCounts undefined when the counters are absent', () => {
    // Match-embedded roster snapshots carry totalStarPlayerPoints but none of
    // the per-action-type counters; such a player gets no ongoing-competition
    // estimate rather than a wrong one.
    expect(
      service.parse(rosterBody()).players[0]?.careerCounts,
    ).toBeUndefined();
  });

  it('leaves careerCounts undefined when only some counters are present', () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          {
            id: 2412443,
            name: 'The Agitated Deviation',
            number: 1,
            lineUpMasterId: 952,
            rosterId: 123,
            position: 'Dwarf Lineman',
            isBigGuy: false,
            totalStarPlayerPoints: 23,
            totalTouchdowns: 12,
            totalPass: 4,
          },
        ],
      }),
    );
    expect(roster.players[0]?.careerCounts).toBeUndefined();
  });

  it('rejects a fractional career counter', () => {
    expect(() =>
      service.parse(
        rosterBody({
          lineUps: [
            {
              id: 2412443,
              name: 'The Agitated Deviation',
              number: 1,
              lineUpMasterId: 952,
              rosterId: 123,
              position: 'Dwarf Lineman',
              isBigGuy: false,
              totalStarPlayerPoints: 23,
              totalTouchdowns: 1.5,
              totalPass: 4,
              totalInterceptions: 2,
              totalMVP: 3,
              totalCasualties: 5,
            },
          ],
        }),
      ),
    ).toThrow(/totalTouchdowns/);
  });

  it('rejects a negative career counter', () => {
    expect(() =>
      service.parse(
        rosterBody({
          lineUps: [
            {
              id: 2412443,
              name: 'The Agitated Deviation',
              number: 1,
              lineUpMasterId: 952,
              rosterId: 123,
              position: 'Dwarf Lineman',
              isBigGuy: false,
              totalStarPlayerPoints: 23,
              totalTouchdowns: -1,
              totalPass: 4,
              totalInterceptions: 2,
              totalMVP: 3,
              totalCasualties: 5,
            },
          ],
        }),
      ),
    ).toThrow(/totalTouchdowns/);
  });

  it('carries a zero Passing straight through for a position that cannot pass', () => {
    const roster = service.parse(
      rosterBody({
        rosterMaster: {
          name: 'Dwarf',
          starPlayersMasters: [],
          lineUpMasters: [
            {
              id: 954,
              position: 'Troll Slayer',
              ma: 5,
              st: 3,
              ag: 4,
              pa: 0,
              av: 9,
            },
          ],
        },
      }),
    );

    expect(roster.positions[0].characteristics.passing).toBe(0);
  });

  it('rejects a lineUpMasters entry missing a characteristic, naming the field', () => {
    expect(() =>
      service.parse(
        rosterBody({
          rosterMaster: {
            name: 'Dwarf',
            starPlayersMasters: [],
            lineUpMasters: [
              {
                id: 952,
                position: 'Dwarf Lineman',
                ma: 5,
                st: 3,
                ag: 4,
                av: 9,
              },
            ],
          },
        }),
      ),
    ).toThrow(/rosterMaster\.lineUpMasters\.0\.pa/);
  });

  it('rejects a starPlayersMasters entry missing a characteristic, naming the field', () => {
    expect(() =>
      service.parse(
        rosterBody({
          rosterMaster: {
            name: 'Dwarf',
            starPlayersMasters: [
              {
                id: 5001,
                position: 'Grim Ironjaw',
                ma: 5,
                st: 4,
                ag: 4,
                pa: 5,
              },
            ],
            lineUpMasters: [],
          },
        }),
      ),
    ).toThrow(/rosterMaster\.starPlayersMasters\.0\.av/);
  });

  it("parses a lineUp entry's own characteristics", () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          {
            id: 2412443,
            name: 'The Agitated Deviation',
            number: 1,
            lineUpMasterId: 952,
            rosterId: 123,
            position: 'Dwarf Lineman',
            isBigGuy: false,
            totalStarPlayerPoints: 23,
            ma: 6,
            st: 4,
            ag: 3,
            pa: 5,
            av: 10,
          },
        ],
      }),
    );

    expect(roster.players[0]?.characteristics).toEqual({
      move: 6,
      strength: 4,
      agility: 3,
      passing: 5,
      armour: 10,
    });
  });

  it('carries a zero Passing on a lineUp entry through unchanged', () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          {
            id: 2412443,
            name: 'The Agitated Deviation',
            number: 1,
            lineUpMasterId: 952,
            rosterId: 123,
            position: 'Dwarf Lineman',
            isBigGuy: false,
            totalStarPlayerPoints: 23,
            ma: 5,
            st: 3,
            ag: 4,
            pa: 0,
            av: 9,
          },
        ],
      }),
    );

    expect(roster.players[0]?.characteristics?.passing).toBe(0);
  });

  it('leaves characteristics undefined when the lineUp entry carries none', () => {
    expect(
      service.parse(rosterBody()).players[0]?.characteristics,
    ).toBeUndefined();
  });

  it("parses a player's live lasting-injury fields", () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [lineUp({ nigglingInjuries: 2, canPlayNextGame: false })],
      }),
    );

    expect(roster.players[0]?.lastingInjuries).toEqual({
      nigglingInjuries: 2,
      canPlayNextGame: false,
    });
  });

  it('parses the per-entry position template', () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          lineUp({
            ma: 6,
            st: 3,
            ag: 3,
            pa: 5,
            av: 6,
            lineUpMaster: {
              id: 971,
              position: 'Halfling Catcher',
              ma: 5,
              st: 3,
              ag: 3,
              pa: 4,
              av: 7,
            },
          }),
        ],
      }),
    );

    expect(roster.players[0]?.positionTemplate).toEqual({
      move: 5,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 7,
    });
  });

  it('leaves both undefined for a match-embedded snapshot that carries neither', () => {
    // MatchParserService reuses LineUpSchema for the per-match roster
    // snapshots, which carry no live-state fields and no template at all.
    const roster = service.parse(rosterBody({ lineUps: [lineUp()] }));

    expect(roster.players[0]?.lastingInjuries).toBeUndefined();
    expect(roster.players[0]?.positionTemplate).toBeUndefined();
  });

  it('treats the lasting-injury pair as all-or-nothing', () => {
    // Matching how careerCounts and characteristics already behave: a half
    // set cannot be acted on, so it is reported as absent rather than
    // silently defaulted.
    const roster = service.parse(
      rosterBody({ lineUps: [lineUp({ nigglingInjuries: 1 })] }),
    );

    expect(roster.players[0]?.lastingInjuries).toBeUndefined();
  });

  it('ignores a template with an incomplete characteristics line', () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          lineUp({
            lineUpMaster: { id: 971, position: 'Halfling Catcher', ma: 5 },
          }),
        ],
      }),
    );

    expect(roster.players[0]?.positionTemplate).toBeUndefined();
  });

  it("reads the position template's skills as the player's starting skills", () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          lineUp({
            lineUpMaster: {
              id: 952,
              position: 'Dwarf Lineman',
              ma: 6,
              st: 3,
              ag: 3,
              pa: 4,
              av: 9,
              skills: [
                {
                  skillMasterId: 138,
                  skillAttributeMaster: { type: 1, value: '+1' },
                },
                { skillMasterId: 149 },
              ],
            },
            skills: [],
          }),
        ],
      }),
    );

    expect(roster.players[0].skills?.starting).toEqual([
      { skillMasterId: 138, attributeValue: '+1', attributeType: 1 },
      { skillMasterId: 149 },
    ]);
  });

  it("reads the player's own skills as gained, carrying isRandom", () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          lineUp({
            lineUpMaster: {
              id: 952,
              position: 'Dwarf Lineman',
              ma: 6,
              st: 3,
              ag: 3,
              pa: 4,
              av: 9,
              skills: [],
            },
            skills: [
              { skillMasterId: 103, isRandom: true },
              { skillMasterId: 126, isRandom: false },
            ],
          }),
        ],
      }),
    );

    expect(roster.players[0].skills?.gained).toEqual([
      { skillMasterId: 103, isRandom: true },
      { skillMasterId: 126, isRandom: false },
    ]);
  });

  it("carries a gained skill's type-3 attribute through unresolved", () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          lineUp({
            lineUpMaster: {
              id: 952,
              position: 'Dwarf Lineman',
              ma: 6,
              st: 3,
              ag: 3,
              pa: 4,
              av: 9,
              skills: [],
            },
            skills: [
              {
                skillMasterId: 307,
                isRandom: false,
                skillAttributeMaster: { type: 3, value: '113' },
              },
            ],
          }),
        ],
      }),
    );

    expect(roster.players[0].skills?.gained).toEqual([
      {
        skillMasterId: 307,
        isRandom: false,
        attributeValue: '113',
        attributeType: 3,
      },
    ]);
  });

  it('reports no skill group for an entry with no position template', () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [lineUp({ skills: [{ skillMasterId: 261 }] })],
      }),
    );

    expect(roster.players[0].skills).toBeUndefined();
  });

  it('reports an empty gained list for a roster player who has advanced nothing', () => {
    const roster = service.parse(
      rosterBody({
        lineUps: [
          lineUp({
            lineUpMaster: {
              id: 952,
              position: 'Dwarf Lineman',
              ma: 6,
              st: 3,
              ag: 3,
              pa: 4,
              av: 9,
              skills: [],
            },
          }),
        ],
      }),
    );

    expect(roster.players[0].skills).toEqual({ starting: [], gained: [] });
  });

  it('reports skills as absent when a gained entry carries no isRandom flag', () => {
    // A match-embedded lineUps entry (LineUpSchema reused by MatchParserService)
    // carries a flat skills list of bare ids and no lineUpMaster at all, but
    // this exercises the isRandom-missing branch directly regardless of cause.
    const roster = service.parse(
      rosterBody({
        lineUps: [
          lineUp({
            lineUpMaster: {
              id: 952,
              position: 'Dwarf Lineman',
              ma: 6,
              st: 3,
              ag: 3,
              pa: 4,
              av: 9,
              skills: [],
            },
            skills: [{ skillMasterId: 261 }],
          }),
        ],
      }),
    );

    expect(roster.players[0].skills).toBeUndefined();
  });
});

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { RosterParserService } from './roster-parser.service';

function rosterBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    teamName: 'The Dwarf Team',
    teamRace: 'Dwarf_BB2025',
    player: { applicationUserId: 'guid-coach-1' },
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
    rosterMaster: {
      name: 'Dwarf',
      starPlayersMasters: [
        { id: 5001, position: 'Grim Ironjaw' },
        { id: 5002, position: "Morg 'n' Thorg" },
      ],
      lineUpMasters: [
        { id: 952, position: 'Dwarf Lineman' },
        { id: 953, position: 'Dwarf Runner' },
      ],
    },
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
      positions: [
        { tpPositionId: 952, name: 'Dwarf Lineman' },
        { tpPositionId: 953, name: 'Dwarf Runner' },
      ],
      starPositions: [
        { tpPositionId: 5001, name: 'Grim Ironjaw' },
        { tpPositionId: 5002, name: "Morg 'n' Thorg" },
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
        },
      ],
    });
  });

  it('parses each starPlayersMasters entry into a star position', () => {
    const roster = service.parse(rosterBody());
    expect(roster.starPositions).toEqual([
      { tpPositionId: 5001, name: 'Grim Ironjaw' },
      { tpPositionId: 5002, name: "Morg 'n' Thorg" },
    ]);
  });

  it('returns an empty starPositions array when starPlayersMasters is empty', () => {
    const roster = service.parse(
      rosterBody({
        rosterMaster: {
          name: 'Dwarf',
          starPlayersMasters: [],
          lineUpMasters: [{ id: 952, position: 'Dwarf Lineman' }],
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
          },
        ],
      }),
    );
    expect(roster.players[0]?.isBigGuy).toBe(false);
  });

  it('returns an empty players array when lineUps is empty', () => {
    expect(service.parse(rosterBody({ lineUps: [] })).players).toEqual([]);
  });
});

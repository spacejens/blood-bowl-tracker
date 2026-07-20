import { describe, expect, it } from 'vitest';

import { RosterParserService } from './roster-parser.service';

const parser = new RosterParserService();

function rosterBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 123,
    teamName: 'The Dwarf Team',
    teamRace: 'Dwarf_BB2025',
    player: { applicationUserId: 'guid-coach-1' },
    rosterMaster: {
      name: 'Dwarf',
      starPlayersMasters: [],
      lineUpMasters: [
        { id: 952, position: 'Dwarf Lineman' },
        { id: 953, position: 'Dwarf Runner' },
      ],
    },
    ...overrides,
  };
}

describe('RosterParserService', () => {
  it('extracts the roster identity, race, coach and positions', () => {
    expect(parser.parse(rosterBody())).toEqual({
      id: 123,
      teamName: 'The Dwarf Team',
      teamRaceCode: 'Dwarf_BB2025',
      raceName: 'Dwarf',
      coachTpId: 'guid-coach-1',
      positions: [
        { tpPositionId: 952, name: 'Dwarf Lineman' },
        { tpPositionId: 953, name: 'Dwarf Runner' },
      ],
    });
  });

  it('ignores the (always empty) starPlayersMasters array', () => {
    const roster = parser.parse(rosterBody());
    expect(roster.positions).toHaveLength(2);
  });

  it('throws a descriptive error naming rosterMaster.name when it is missing', () => {
    expect(() =>
      parser.parse(rosterBody({ rosterMaster: { lineUpMasters: [] } })),
    ).toThrow(/rosterMaster\.name/);
  });

  it('throws naming player.applicationUserId when the coach id is missing', () => {
    expect(() => parser.parse(rosterBody({ player: {} }))).toThrow(
      /player\.applicationUserId/,
    );
  });

  it('throws for a non-object body', () => {
    expect(() => parser.parse(null)).toThrow(/Invalid TP roster JSON/);
  });
});

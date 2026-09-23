import type {
  TpPlayerSkills,
  TpRosterPlayer,
} from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { TpRosterEntry } from '../../tp-roster-entry';
import { makeService } from './tp-players-import.test-helpers';

/** One roster in 'Third Era' with one player on position 952, whose own
 * skill group is configurable. */
function rosterWith(skills: TpPlayerSkills | undefined): TpRosterEntry[] {
  return [
    {
      era: 'Third Era',
      roster: {
        id: 123,
        teamName: 'Team 123',
        teamRaceCode: 'Dwarf',
        raceName: 'Dwarf',
        coachTpId: 'coach-1',
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
        ],
        starPositions: [],
        players: [
          {
            id: 2412443,
            name: 'The Agitated Deviation',
            number: 4,
            lineUpMasterId: 952,
            rosterId: 123,
            fallbackPositionName: 'Dwarf Lineman',
            isBigGuy: false,
            totalStarPlayerPoints: 23,
            ...(skills ? { skills } : {}),
          },
        ],
      },
    },
  ];
}

/** A match-embedded-only player (departed, absent from the standalone
 * roster file) -- carries no skills field, matching the schema TP's
 * match-embedded snapshots actually parse to. */
const matchEmbeddedPlayer: TpRosterPlayer = {
  id: 999_001,
  name: 'The Departed One',
  number: 9,
  lineUpMasterId: 952,
  rosterId: 123,
  fallbackPositionName: 'Dwarf Lineman',
  isBigGuy: false,
  totalStarPlayerPoints: 5,
};

const teamEras = new Map([[123, [{ id: 5000, eraId: 500 }]]]);

const SKILLS: TpPlayerSkills = {
  starting: [{ skillMasterId: 87 }],
  gained: [{ skillMasterId: 220, isRandom: false }],
};

describe('TpPlayersImportService skills accumulation', () => {
  it("accumulates every imported roster player's skill group by database id", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    const { skillsByPlayerId } = await service.importPlayers({
      rosters: rosterWith(SKILLS),
      teamErasByRosterId: teamEras,
    });

    expect(skillsByPlayerId).toEqual(new Map([[900, SKILLS]]));
  });

  it('records nothing for a player merged in from a match-embedded snapshot', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    const { skillsByPlayerId } = await service.importPlayers({
      rosters: rosterWith(undefined),
      teamErasByRosterId: teamEras,
      matchEmbeddedPlayersByRosterId: new Map([[123, [matchEmbeddedPlayer]]]),
    });

    expect(skillsByPlayerId.size).toBe(0);
  });

  it('records nothing for a player whose upsert failed', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue(undefined);
    const { service } = await makeService({ upsertPlayerResult });

    const { skillsByPlayerId } = await service.importPlayers({
      rosters: rosterWith(SKILLS),
      teamErasByRosterId: teamEras,
    });

    expect(skillsByPlayerId.size).toBe(0);
  });
});

import { describe, expect, it, vi } from 'vitest';

import type { RosterEntry } from '../source/roster-collection.service';
import { makeService } from './tp-players-import.test-helpers';

/** The player's own current line: MA 6 ST 4 AG 3 PA 5 AV 10. */
const OWN = { move: 6, strength: 4, agility: 3, passing: 5, armour: 10 };

/**
 * One roster in 'Third Era' with one player on position 952, whose own
 * characteristics are configurable. Deliberately separate from the shared
 * `rosters` fixture in the test-helpers, which stays characteristics-free so
 * the existing tp-players-import.service.spec.ts payload assertions still hold.
 */
function rosterWith(characteristics: typeof OWN | undefined): RosterEntry[] {
  return [
    {
      era: 'Third Era',
      competition: 'comp',
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
            ...(characteristics ? { characteristics } : {}),
          },
        ],
      },
    },
  ];
}

const teamEras = new Map([[123, [{ id: 5000, eraId: 500 }]]]);

describe('TpPlayersImportService characteristics', () => {
  it("sends a roster player's own characteristics with its era rules set", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters: rosterWith(OWN),
      teamErasByRosterId: teamEras,
    });

    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        move: 6,
        strength: 4,
        agility: 3,
        passing: 5,
        armour: 10,
        rulesSetId: 900,
      }),
      expect.anything(),
    );
  });

  it('treats a star-position player no differently: its own lineUps values are sent', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters: rosterWith({
        move: 7,
        strength: 5,
        agility: 2,
        passing: 4,
        armour: 11,
      }),
      teamErasByRosterId: teamEras,
      starPositionIds: new Set([200]),
    });

    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        move: 7,
        strength: 5,
        agility: 2,
        passing: 4,
        armour: 11,
        rulesSetId: 900,
      }),
      expect.anything(),
    );
  });

  it('sends no characteristics for a player carrying none', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters: rosterWith(undefined),
      teamErasByRosterId: teamEras,
    });

    const payload = upsertPlayerResult.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('move');
    expect(payload).not.toHaveProperty('rulesSetId');
  });

  it("sends no characteristics when the player's era resolved to no rules set", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({
      upsertPlayerResult,
      rulesSetIdByEraName: new Map([['Fourth Era', 901]]),
    });

    await service.importPlayers({
      rosters: rosterWith(OWN),
      teamErasByRosterId: teamEras,
    });

    const payload = upsertPlayerResult.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('move');
    expect(payload).not.toHaveProperty('rulesSetId');
    // The player itself still imports; only characteristics are skipped.
    expect(payload.name).toBe('The Agitated Deviation');
  });
});

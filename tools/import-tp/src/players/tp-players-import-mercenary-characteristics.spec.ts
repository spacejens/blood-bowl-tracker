import type { ImportError } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { RosterEntry } from '../source/roster-collection.service';
import { makeService } from './tp-players-import.test-helpers';

/**
 * A roster in 'Third Era' whose players are all mercenary Big Guy hires of the
 * same "Giant Mercenary" fallback position: lineUpMasterId 440 is deliberately
 * absent from the helper's position lookup (which only knows 952), so each one
 * takes the isBigGuy fallback path. Mirrors the real "Bifrost Bryggmastare"
 * data that motivated this feature.
 */
function mercenaryRosters(
  players: {
    id: number;
    characteristics?: {
      move: number;
      strength: number;
      agility: number;
      passing: number;
      armour: number;
    };
  }[],
): RosterEntry[] {
  return [
    {
      era: 'Third Era',
      competition: 'comp',
      roster: {
        id: 123,
        teamName: 'Team 123',
        teamRaceCode: 'Norse',
        raceName: 'Norse',
        coachTpId: 'coach-1',
        positions: [],
        starPositions: [],
        players: players.map(({ id, characteristics }) => ({
          id,
          name: 'Giant',
          number: 20,
          lineUpMasterId: 440,
          rosterId: 123,
          fallbackPositionName: 'Giant Mercenary',
          isBigGuy: true,
          totalStarPlayerPoints: 41,
          ...(characteristics ? { characteristics } : {}),
        })),
      },
    },
  ];
}

const teamEras = new Map([[123, [{ id: 5000, eraId: 500 }]]]);

describe('TpPlayersImportService mercenary characteristics', () => {
  it("syncs the mercenary Position's curated characteristics once per distinct name", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service, mercenaryCharacteristics } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    await service.importPlayers({
      rosters: mercenaryRosters([{ id: 1399322 }, { id: 1970614 }]),
      teamErasByRosterId: teamEras,
    });

    expect(
      mercenaryCharacteristics.syncPositionCharacteristics,
    ).toHaveBeenCalledTimes(1);
    expect(
      mercenaryCharacteristics.syncPositionCharacteristics,
    ).toHaveBeenCalledWith({
      positionName: 'Giant Mercenary',
      positionId: 800,
      tpSystemId: 1,
      errors: expect.anything() as ImportError[],
    });
  });

  it('does not sync curated characteristics when the mercenary position upsert fails', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue(undefined);
    const { service, mercenaryCharacteristics } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    await service.importPlayers({
      rosters: mercenaryRosters([{ id: 1399322 }]),
      teamErasByRosterId: teamEras,
    });

    expect(
      mercenaryCharacteristics.syncPositionCharacteristics,
    ).not.toHaveBeenCalled();
  });
});

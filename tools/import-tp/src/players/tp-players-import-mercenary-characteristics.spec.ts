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

  it("sends a mercenary hire the curated characteristics for its era's rules set", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service, mercenaryCharacteristics } = await makeService({
      upsertPlayerResult,
      upsertPosition,
      mercenaryPlayerCharacteristics: {
        move: 6,
        strength: 7,
        agility: 5,
        passing: 5,
        armour: 11,
        rulesSetId: 900,
      },
    });

    await service.importPlayers({
      rosters: mercenaryRosters([{ id: 1399322 }]),
      teamErasByRosterId: teamEras,
    });

    expect(mercenaryCharacteristics.forRosterPlayer).toHaveBeenCalledWith({
      positionName: 'Giant Mercenary',
      player: { id: 1399322, name: 'Giant' },
      rulesSet: { name: 'BB2020', id: 900 },
      errors: expect.anything() as ImportError[],
    });
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Giant',
        move: 6,
        strength: 7,
        agility: 5,
        passing: 5,
        armour: 11,
        rulesSetId: 900,
      }),
      expect.anything(),
    );
  });

  it('imports a mercenary hire without characteristics when the curated table has no entry', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
      // mercenaryPlayerCharacteristics omitted: the curated lookup finds
      // nothing and records its own error (asserted in that service's spec).
    });

    await service.importPlayers({
      rosters: mercenaryRosters([{ id: 1399322 }]),
      teamErasByRosterId: teamEras,
    });

    const payload = upsertPlayerResult.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.name).toBe('Giant');
    expect(payload).not.toHaveProperty('move');
    expect(payload).not.toHaveProperty('rulesSetId');
  });

  it("prefers a mercenary hire's own embedded characteristics over the curated fallback", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service, mercenaryCharacteristics } = await makeService({
      upsertPlayerResult,
      upsertPosition,
      mercenaryPlayerCharacteristics: {
        move: 6,
        strength: 7,
        agility: 5,
        passing: 5,
        armour: 11,
        rulesSetId: 900,
      },
    });

    await service.importPlayers({
      rosters: mercenaryRosters([
        {
          id: 1399322,
          characteristics: {
            move: 5,
            strength: 6,
            agility: 4,
            passing: 4,
            armour: 10,
          },
        },
      ]),
      teamErasByRosterId: teamEras,
    });

    expect(mercenaryCharacteristics.forRosterPlayer).not.toHaveBeenCalled();
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        move: 5,
        strength: 6,
        agility: 4,
        passing: 4,
        armour: 10,
        rulesSetId: 900,
      }),
      expect.anything(),
    );
  });

  it("passes no rules set when the hire's era resolved to none", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service, mercenaryCharacteristics } = await makeService({
      upsertPlayerResult,
      upsertPosition,
      rulesSetIdByEraName: new Map([['Fourth Era', 901]]),
    });

    await service.importPlayers({
      rosters: mercenaryRosters([{ id: 1399322 }]),
      teamErasByRosterId: teamEras,
    });

    expect(mercenaryCharacteristics.forRosterPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSet: undefined }),
    );
  });
});

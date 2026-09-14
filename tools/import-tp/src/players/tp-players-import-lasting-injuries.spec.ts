import type { RulesSet } from '@blood-bowl-tracker/api-contract';
import { describe, expect, it, vi } from 'vitest';

import type { RosterEntry } from '../source/roster-collection.service';
import { makeService } from './tp-players-import.test-helpers';

const bb2020: RulesSet = {
  id: 900,
  name: 'BB2020',
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
  createdAt: new Date('2026-01-01'),
};

const rulesSetsByName = new Map([['BB2020', bb2020]]);

/**
 * One 'Third Era' roster with one player whose live state and stat line are
 * configurable. Separate from the shared fixture, which stays
 * lasting-injury-free so the existing payload assertions still hold.
 */
function rosterWith(overrides: Record<string, unknown>): RosterEntry[] {
  return [
    {
      era: 'Third Era',
      competition: 'comp',
      roster: {
        id: 123,
        teamName: 'Team 123',
        teamRaceCode: 'Halfling',
        raceName: 'Halfling',
        coachTpId: 'coach-1',
        positions: [
          {
            tpPositionId: 971,
            name: 'Halfling Catcher',
            characteristics: {
              move: 5,
              strength: 2,
              agility: 3,
              passing: 4,
              armour: 7,
            },
          },
        ],
        starPositions: [],
        players: [
          {
            id: 2616375,
            name: 'Shezbeth Queen of Lies',
            number: 5,
            lineUpMasterId: 971,
            rosterId: 123,
            fallbackPositionName: 'Halfling Catcher',
            isBigGuy: false,
            totalStarPlayerPoints: 21,
            characteristics: {
              move: 5,
              strength: 2,
              agility: 3,
              passing: 4,
              armour: 7,
            },
            positionTemplate: {
              move: 5,
              strength: 2,
              agility: 3,
              passing: 4,
              armour: 7,
            },
            lastingInjuries: { nigglingInjuries: 0, canPlayNextGame: true },
            ...overrides,
          },
        ],
      },
    },
  ];
}

const teamEras = new Map([[123, [{ id: 5000, eraId: 500 }]]]);

describe('TpPlayersImportService lasting injuries', () => {
  it("sends a roster player's live lasting-injury state", async () => {
    const upsertPlayerResult = vi
      .fn()
      .mockResolvedValue({ id: 900, created: true });
    const { service } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters: rosterWith({
        lastingInjuries: { nigglingInjuries: 2, canPlayNextGame: false },
      }),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        missNextGame: true,
        nigglingInjuryCount: 2,
        armourReductionCount: 0,
      }),
      expect.anything(),
    );
  });

  it('detects a stat reduction against the position template', async () => {
    const upsertPlayerResult = vi
      .fn()
      .mockResolvedValue({ id: 900, created: true });
    const { service } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters: rosterWith({
        // av 6 against the template's 7, and ma 6 against its 5 — one real
        // injury and one advancement on the same player.
        characteristics: {
          move: 6,
          strength: 2,
          agility: 3,
          passing: 4,
          armour: 6,
        },
      }),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        armourReductionCount: 1,
        moveReductionCount: 0,
      }),
      expect.anything(),
    );
  });

  it('sends no lasting-injury fields for a player carrying no live state', async () => {
    const upsertPlayerResult = vi
      .fn()
      .mockResolvedValue({ id: 900, created: true });
    const { service } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters: rosterWith({ lastingInjuries: undefined }),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    const payload = upsertPlayerResult.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('missNextGame');
    expect(payload).not.toHaveProperty('nigglingInjuryCount');
  });

  it('reports only the players this run inserted', async () => {
    const upsertPlayerResult = vi
      .fn()
      .mockResolvedValue({ id: 900, created: false });
    const { service } = await makeService({ upsertPlayerResult });

    const outcome = await service.importPlayers({
      rosters: rosterWith({}),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(outcome.insertedPlayerIds).toEqual([]);
  });

  it('reports a freshly inserted player', async () => {
    const upsertPlayerResult = vi
      .fn()
      .mockResolvedValue({ id: 900, created: true });
    const { service } = await makeService({ upsertPlayerResult });

    const outcome = await service.importPlayers({
      rosters: rosterWith({}),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(outcome.insertedPlayerIds).toEqual([900]);
  });
});

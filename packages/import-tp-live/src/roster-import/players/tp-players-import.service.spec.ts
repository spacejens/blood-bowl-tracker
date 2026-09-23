import { describe, expect, it, vi } from 'vitest';

import type { TpRosterEntry } from '../../tp-roster-entry';
import {
  CANNED_RESULT,
  makeService,
  resultArgs,
  rosters,
  TP_SYSTEM_ID,
} from './tp-players-import.test-helpers';

describe('TpPlayersImportService', () => {
  it('imports a resolvable roster player and maps its lineUpId to the DB id', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
    });

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(resultArgs(importResults).imported).toBe(1);
    expect(playerIdsByLineUpId.get(2412443)).toBe(900);
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      {
        name: 'The Agitated Deviation',
        teamEraId: 5000,
        positionId: 200,
        sppTotal: 23,
        externalIds: [{ externalSystemId: 1, externalId: '2412443' }],
      },
      expect.anything(),
    );
  });

  it("resolves each player's position by its TP position id", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, lookup } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(lookup.lookupMap).toHaveBeenCalledWith(
      'position',
      expect.arrayContaining([
        { externalSystemId: TP_SYSTEM_ID, externalId: '952' },
      ]),
    );
  });

  it('imports a player present only in matchEmbeddedPlayersByRosterId (absent from roster.players), filling the departed-player gap', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 901 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
    });

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      matchEmbeddedPlayersByRosterId: new Map([
        [
          123,
          [
            {
              id: 9999999,
              name: 'A Departed Player',
              number: 7,
              lineUpMasterId: 952,
              rosterId: 123,
              fallbackPositionName: 'Dwarf Lineman',
              isBigGuy: false,
              totalStarPlayerPoints: 12,
            },
          ],
        ],
      ]),
    });

    expect(resultArgs(importResults).imported).toBe(2);
    expect(playerIdsByLineUpId.get(9999999)).toBe(901);
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'A Departed Player',
        externalIds: [{ externalSystemId: 1, externalId: '9999999' }],
      }),
      expect.anything(),
    );
  });

  it('prefers roster.players data over matchEmbeddedPlayersByRosterId for the same player id', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      matchEmbeddedPlayersByRosterId: new Map([
        [
          123,
          [
            {
              // Same id as the roster.players entry (2412443) but a
              // differing name, proving roster.players wins on conflict
              // rather than just merging.
              id: 2412443,
              name: 'Stale Match-Embedded Name',
              number: 4,
              lineUpMasterId: 952,
              rosterId: 123,
              fallbackPositionName: 'Dwarf Lineman',
              isBigGuy: false,
              totalStarPlayerPoints: 7,
            },
          ],
        ],
      ]),
    });

    expect(upsertPlayerResult).toHaveBeenCalledTimes(1);
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'The Agitated Deviation' }),
      expect.anything(),
    );
  });

  it('records an unknown-era error and skips a player whose roster era is not imported', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      eraIdsByName: new Map(),
    });

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(playerIdsByLineUpId.size).toBe(0);
    expect(
      resultArgs(importResults).errors.some((e) =>
        e.message.toLowerCase().includes('era'),
      ),
    ).toBe(true);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('records a non-fatal error and skips a player whose team era cannot be resolved', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
    });

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map(),
    });

    expect(playerIdsByLineUpId.size).toBe(0);
    expect(resultArgs(importResults).errors.length).toBeGreaterThan(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('records a non-fatal error and skips a player whose position cannot be resolved', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      positionIdsByExternalId: new Map(),
    });

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(playerIdsByLineUpId.size).toBe(0);
    expect(resultArgs(importResults).errors.length).toBeGreaterThan(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertPlayerResult = vi.fn();
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: { item: { externalSystems: ['TP'] }, message: 'boom' },
      }),
    });

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(resultArgs(importResults).errors).toHaveLength(1);
    expect(playerIdsByLineUpId.size).toBe(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('imports an embedded star player from a standalone roster whose lineUpMasterId resolves via a star catalog id', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 950 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      positionIdsByExternalId: new Map([['5002', 700]]),
    });

    // A permanently-rostered star player: its lineUps entry references a star
    // catalog id (5002), resolved server-side by its stringified id.
    const starRosters: TpRosterEntry[] = [
      {
        era: 'Third Era',
        roster: {
          id: 123,
          teamName: 'Team 123',
          teamRaceCode: 'Dwarf',
          raceName: 'Dwarf',
          coachTpId: 'coach-1',
          positions: [],
          starPositions: [
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
              id: 3000001,
              name: "Morg 'n' Thorg",
              number: 16,
              lineUpMasterId: 5002,
              rosterId: 123,
              fallbackPositionName: "Morg 'n' Thorg",
              isBigGuy: false,
              totalStarPlayerPoints: 88,
            },
          ],
        },
      },
    ];

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters: starRosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(resultArgs(importResults).imported).toBe(1);
    expect(playerIdsByLineUpId.get(3000001)).toBe(950);
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      {
        name: "Morg 'n' Thorg",
        teamEraId: 5000,
        positionId: 700,
        sppTotal: 88,
        externalIds: [{ externalSystemId: 1, externalId: '3000001' }],
      },
      expect.anything(),
    );
  });

  it('imports an embedded star player present only in a match-embedded snapshot', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 951 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      // '952' -> 200 is the regular position from the shared `rosters`
      // fixture (the default); '5002' -> 700 is the star catalog id.
      positionIdsByExternalId: new Map([
        ['952', 200],
        ['5002', 700],
      ]),
    });

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      matchEmbeddedPlayersByRosterId: new Map([
        [
          123,
          [
            {
              id: 3000002,
              name: 'Akhorne the Squirrel',
              number: 17,
              lineUpMasterId: 5002,
              rosterId: 123,
              fallbackPositionName: 'Akhorne the Squirrel',
              isBigGuy: false,
              totalStarPlayerPoints: 55,
            },
          ],
        ],
      ]),
    });

    // Two players: the standalone roster's regular player plus the
    // match-embedded star player.
    expect(resultArgs(importResults).imported).toBe(2);
    expect(playerIdsByLineUpId.get(3000002)).toBe(951);
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Akhorne the Squirrel',
        positionId: 700,
        externalIds: [{ externalSystemId: 1, externalId: '3000002' }],
      }),
      expect.anything(),
    );
  });

  it('imports a mercenary Big Guy (isBigGuy: true, unresolvable lineUpMasterId) via its fallbackPositionName as an isStarPlayer position', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const mercenaryRosters: TpRosterEntry[] = [
      {
        era: 'Third Era',
        roster: {
          id: 123,
          teamName: 'Team 123',
          teamRaceCode: 'Norse',
          raceName: 'Norse',
          coachTpId: 'coach-1',
          positions: [],
          starPositions: [],
          players: [
            {
              id: 1399322,
              name: 'Giant',
              number: 20,
              lineUpMasterId: 440,
              rosterId: 123,
              fallbackPositionName: 'Giant Mercenary',
              isBigGuy: true,
              totalStarPlayerPoints: 41,
            },
          ],
        },
      },
    ];

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters: mercenaryRosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      // 440 is deliberately absent -- neither a regular nor a star catalog id.
    });

    expect(resultArgs(importResults).imported).toBe(1);
    expect(playerIdsByLineUpId.get(1399322)).toBe(960);
    expect(upsertPosition).toHaveBeenCalledWith(
      {
        name: 'Giant Mercenary',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 1, externalId: 'Giant Mercenary' },
          { externalSystemId: 2, externalId: 'Giant Mercenary' },
        ],
      },
      expect.anything(),
    );
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      {
        name: 'Giant',
        teamEraId: 5000,
        positionId: 800,
        sppTotal: 41,
        externalIds: [{ externalSystemId: 1, externalId: '1399322' }],
      },
      expect.anything(),
    );
  });

  it('reuses one mercenary Position across multiple players sharing the same fallbackPositionName', async () => {
    const upsertPlayerResult = vi
      .fn()
      .mockResolvedValueOnce({ id: 960 })
      .mockResolvedValueOnce({ id: 961 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const mercenaryRosters: TpRosterEntry[] = [
      {
        era: 'Third Era',
        roster: {
          id: 123,
          teamName: 'Team 123',
          teamRaceCode: 'Norse',
          raceName: 'Norse',
          coachTpId: 'coach-1',
          positions: [],
          starPositions: [],
          players: [
            {
              id: 1399322,
              name: 'Giant',
              number: 20,
              lineUpMasterId: 440,
              rosterId: 123,
              fallbackPositionName: 'Giant Mercenary',
              isBigGuy: true,
              totalStarPlayerPoints: 41,
            },
            {
              id: 1970614,
              name: 'Giant',
              number: 27,
              lineUpMasterId: 440,
              rosterId: 123,
              fallbackPositionName: 'Giant Mercenary',
              isBigGuy: true,
              totalStarPlayerPoints: 19,
            },
          ],
        },
      },
    ];

    await service.importPlayers({
      rosters: mercenaryRosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(resultArgs(importResults).imported).toBe(2);
    expect(upsertPosition).toHaveBeenCalledTimes(1);
  });

  it('emits a mercenaryPositionUsage for a mercenary Big Guy resolved via the fallback position name', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const mercenaryRosters: TpRosterEntry[] = [
      {
        era: 'Third Era',
        roster: {
          id: 123,
          teamName: 'Team 123',
          teamRaceCode: 'Norse',
          raceName: 'Norse',
          coachTpId: 'coach-1',
          positions: [],
          starPositions: [],
          players: [
            {
              id: 1399322,
              name: 'Giant',
              number: 20,
              lineUpMasterId: 440,
              rosterId: 123,
              fallbackPositionName: 'Giant Mercenary',
              isBigGuy: true,
              totalStarPlayerPoints: 41,
            },
          ],
        },
      },
    ];

    const { mercenaryPositionUsages } = await service.importPlayers({
      rosters: mercenaryRosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(mercenaryPositionUsages).toEqual([
      { positionId: 800, teamRaceCode: 'Norse', era: 'Third Era' },
    ]);
  });

  it('emits one mercenaryPositionUsage per hire, sharing the same position id, when several mercenaries share a fallback name', async () => {
    const upsertPlayerResult = vi
      .fn()
      .mockResolvedValueOnce({ id: 960 })
      .mockResolvedValueOnce({ id: 961 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const mercenaryRosters: TpRosterEntry[] = [
      {
        era: 'Third Era',
        roster: {
          id: 123,
          teamName: 'Team 123',
          teamRaceCode: 'Norse',
          raceName: 'Norse',
          coachTpId: 'coach-1',
          positions: [],
          starPositions: [],
          players: [
            {
              id: 1399322,
              name: 'Giant',
              number: 20,
              lineUpMasterId: 440,
              rosterId: 123,
              fallbackPositionName: 'Giant Mercenary',
              isBigGuy: true,
              totalStarPlayerPoints: 41,
            },
            {
              id: 1970614,
              name: 'Giant',
              number: 27,
              lineUpMasterId: 440,
              rosterId: 123,
              fallbackPositionName: 'Giant Mercenary',
              isBigGuy: true,
              totalStarPlayerPoints: 19,
            },
          ],
        },
      },
    ];

    const { mercenaryPositionUsages } = await service.importPlayers({
      rosters: mercenaryRosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(mercenaryPositionUsages).toEqual([
      { positionId: 800, teamRaceCode: 'Norse', era: 'Third Era' },
      { positionId: 800, teamRaceCode: 'Norse', era: 'Third Era' },
    ]);
  });

  it('emits no mercenaryPositionUsage for a regular (non-mercenary) roster player', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    const { mercenaryPositionUsages } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(mercenaryPositionUsages).toEqual([]);
  });

  it('skips a mercenary Big Guy without creating a player when the fallback position upsert fails', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue(undefined);
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const mercenaryRosters: TpRosterEntry[] = [
      {
        era: 'Third Era',
        roster: {
          id: 123,
          teamName: 'Team 123',
          teamRaceCode: 'Norse',
          raceName: 'Norse',
          coachTpId: 'coach-1',
          positions: [],
          starPositions: [],
          players: [
            {
              id: 1399322,
              name: 'Giant',
              number: 20,
              lineUpMasterId: 440,
              rosterId: 123,
              fallbackPositionName: 'Giant Mercenary',
              isBigGuy: true,
              totalStarPlayerPoints: 41,
            },
          ],
        },
      },
    ];

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters: mercenaryRosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(playerIdsByLineUpId.size).toBe(0);
    expect(resultArgs(importResults).errors.length).toBeGreaterThan(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('does not fall back to fallbackPositionName for a non-isBigGuy player, and still skips it with an error', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 800 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      upsertPosition,
      // The shared `rosters` fixture's player has lineUpMasterId 952 and
      // isBigGuy: false; omit it from the resolved map so resolution fails.
      positionIdsByExternalId: new Map(),
    });

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(playerIdsByLineUpId.size).toBe(0);
    expect(
      resultArgs(importResults).errors.some((e) =>
        e.message.includes('could not resolve position'),
      ),
    ).toBe(true);
    expect(upsertPosition).not.toHaveBeenCalled();
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('uses the MAXIMUM totalStarPlayerPoints seen for a player id across sources, regardless of which source carries the higher value', async () => {
    // Same player id (2412443) recurs via roster.players and
    // matchEmbeddedPlayersByRosterId with differing totals. Two runs below
    // swap which source reports the higher figure, proving the max wins
    // either way -- not just "whichever source is processed last".
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });
    const base = rosters[0].roster.players[0];
    const embedded = (total: number) => [
      { ...base, totalStarPlayerPoints: total },
    ];
    const options = (
      rosterEntries: TpRosterEntry[],
      embeddedTotal: number,
    ) => ({
      rosters: rosterEntries,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      matchEmbeddedPlayersByRosterId: new Map([[123, embedded(embeddedTotal)]]),
    });

    // roster.players (23) is lower than matchEmbedded (99).
    await service.importPlayers(options(rosters, 99));
    expect(upsertPlayerResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ sppTotal: 99 }),
      expect.anything(),
    );

    // roster.players (99) is higher than matchEmbedded (23).
    const higherRosters: TpRosterEntry[] = [
      {
        ...rosters[0],
        roster: {
          ...rosters[0].roster,
          players: [{ ...base, totalStarPlayerPoints: 99 }],
        },
      },
    ];
    await service.importPlayers(options(higherRosters, 23));
    expect(upsertPlayerResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ sppTotal: 99 }),
      expect.anything(),
    );
  });

  it('returns the ImportResult built by ImportResultService unchanged', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    const { result } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(result).toBe(CANNED_RESULT);
  });

  it('resolves eras from the rosters actually being imported, not the full configured era list', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, lookup } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    // `rosters` only carries "Third Era"; the configured provider (see
    // makeService's default eraIdsByName) also declares "Fourth Era", which
    // must NOT be looked up since no roster being imported is under it.
    expect(lookup.lookupMap).toHaveBeenCalledWith('era', [
      { externalSystemId: TP_SYSTEM_ID, externalId: 'Third Era' },
    ]);
  });

  it('resolves players under an era not in the configured era rules sets list, as long as it exists in the DB', async () => {
    // Models a live single-team import: TpEraResolutionService resolved one
    // era for this team that need not be among whatever
    // TP_ERA_RULES_SETS_PROVIDER.getEras() (the bulk-import configured list)
    // returns -- only the reference lookup (the DB) needs to know it.
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, importResults, lookup } = await makeService({
      upsertPlayerResult,
      eraIdsByName: new Map([
        ['Third Era', 500],
        ['Fourth Era', 501],
        ['Live Era', 502],
      ]),
      getEras: () => [
        { name: 'Third Era', rulesSets: ['BB2020'] },
        { name: 'Fourth Era', rulesSets: ['BB2020'] },
      ],
    });
    const liveRosters: TpRosterEntry[] = [{ ...rosters[0], era: 'Live Era' }];

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters: liveRosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 502 }]]]),
    });

    expect(playerIdsByLineUpId.size).toBe(1);
    // Only the roster's own era ("Live Era") is looked up -- not the full
    // configured era rules sets list ("Third Era", "Fourth Era"), which is
    // what the old buggy code did and what let this test pass either way.
    expect(lookup.lookupMap).toHaveBeenCalledWith('era', [
      { externalSystemId: TP_SYSTEM_ID, externalId: 'Live Era' },
    ]);
    const { errors } = resultArgs(importResults);
    expect(errors).toEqual([]);
  });

  it('records one error and imports nothing when the era rules sets cannot be read', async () => {
    const upsertPlayerResult = vi.fn();
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
    });

    const { playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(playerIdsByLineUpId.size).toBe(0);
    const { imported, errors } = resultArgs(importResults);
    expect(imported).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('TP_ERAS');
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });
});

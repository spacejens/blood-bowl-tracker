import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import { describe, expect, it, vi } from 'vitest';

import type { RosterEntry } from '../source/roster-collection.service';
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

  it('imports a hired star player as an isStarPlayer position + a player on the hiring team-era', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const { starPlayerIdsByRosterAndMaster } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      inducedStarPlayerHireGroups: [
        {
          rosterId: 168446,
          eraId: 500,
          starPlayers: [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
    });

    expect(upsertPosition).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fungus the Loon', isStarPlayer: true }),
      expect.anything(),
    );
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Fungus the Loon',
        teamEraId: 6000,
        positionId: 700,
      }),
      expect.anything(),
    );
    expect(starPlayerIdsByRosterAndMaster.get('168446:1122')).toBe(900);
  });

  it('records a non-fatal error and skips a star player whose hiring team-era cannot be resolved', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const { starPlayerIdsByRosterAndMaster } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map(),
      inducedStarPlayerHireGroups: [
        {
          rosterId: 168446,
          eraId: 500,
          starPlayers: [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
    });

    expect(starPlayerIdsByRosterAndMaster.size).toBe(0);
    expect(resultArgs(importResults).errors.length).toBeGreaterThan(0);
    expect(upsertPosition).not.toHaveBeenCalled();
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('does not redundantly re-import the same hired star player within one run', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const { starPlayerIdsByRosterAndMaster } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      inducedStarPlayerHireGroups: [
        {
          rosterId: 168446,
          eraId: 500,
          starPlayers: [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
    });

    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(upsertPlayerResult).toHaveBeenCalledTimes(1);
    expect(starPlayerIdsByRosterAndMaster.get('168446:1122')).toBe(900);
  });

  it('skips a star player without creating a player when the position upsert fails', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue(undefined);
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const { starPlayerIdsByRosterAndMaster } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      inducedStarPlayerHireGroups: [
        {
          rosterId: 168446,
          eraId: 500,
          starPlayers: [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
    });

    expect(starPlayerIdsByRosterAndMaster.size).toBe(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('attaches a Name-system bare-name external id to hired star positions', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      inducedStarPlayerHireGroups: [
        {
          rosterId: 168446,
          eraId: 500,
          starPlayers: [
            { name: 'Griff Oberwald', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
    });

    const starPositionUpsert = upsertPosition.mock.calls
      .map((c) => c[0] as UpsertPosition)
      .find((d) => d.isStarPlayer && d.name === 'Griff Oberwald');
    expect(starPositionUpsert?.externalIds).toEqual([
      { externalSystemId: 1, externalId: 'Griff Oberwald' },
      { externalSystemId: 2, externalId: 'Griff Oberwald' },
    ]);
  });

  it('disambiguates a hiring team-era spanning multiple eras via the hire group real eraId', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    // Two RosterEntry rows share rosterId 168446 across different eras, so
    // teamErasByRosterId.get(168446) returns two genuinely ambiguous
    // candidates. The first one (in rosters[] order) is deliberately the
    // WRONG era for this hire: a naive `.find()` over rosters would pick
    // this first match -- Third Era, teamEraId 6000 -- instead of the
    // correct 6001, so this test only passes when resolution uses the real
    // eraId rather than roster order.
    const multiEraRosters: RosterEntry[] = [
      ...rosters,
      {
        era: 'Third Era',
        competition: 'comp',
        roster: {
          id: 168446,
          teamName: 'Team 168446 (Third Era)',
          teamRaceCode: 'Human',
          raceName: 'Human',
          coachTpId: 'coach-2',
          positions: [],
          starPositions: [],
          players: [],
        },
      },
      {
        era: 'Fourth Era',
        competition: 'comp',
        roster: {
          id: 168446,
          teamName: 'Team 168446 (Fourth Era)',
          teamRaceCode: 'Human',
          raceName: 'Human',
          coachTpId: 'coach-3',
          positions: [],
          starPositions: [],
          players: [],
        },
      },
    ];

    const { starPlayerIdsByRosterAndMaster } = await service.importPlayers({
      rosters: multiEraRosters,
      teamErasByRosterId: new Map([
        [
          168446,
          [
            { id: 6000, eraId: 500 },
            { id: 6001, eraId: 501 },
          ],
        ],
      ]),
      // The hiring match's competition resolved to eraId 501 (Fourth Era),
      // which must select the 6001 team-era, not the first candidate (6000).
      inducedStarPlayerHireGroups: [
        {
          rosterId: 168446,
          eraId: 501,
          starPlayers: [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
    });

    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({ teamEraId: 6001 }),
      expect.anything(),
    );
    expect(starPlayerIdsByRosterAndMaster.get('168446:1122')).toBe(900);
  });

  it('imports an embedded star player from a standalone roster whose lineUpMasterId resolves via a star catalog id', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 950 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      positionIdsByExternalId: new Map([['5002', 700]]),
    });

    // A permanently-rostered star player: its lineUps entry references a star
    // catalog id (5002), resolved server-side by its stringified id.
    const starRosters: RosterEntry[] = [
      {
        era: 'Third Era',
        competition: 'comp',
        roster: {
          id: 123,
          teamName: 'Team 123',
          teamRaceCode: 'Dwarf',
          raceName: 'Dwarf',
          coachTpId: 'coach-1',
          positions: [],
          starPositions: [{ tpPositionId: 5002, name: "Morg 'n' Thorg" }],
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

    const mercenaryRosters: RosterEntry[] = [
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

    const mercenaryRosters: RosterEntry[] = [
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

  it('skips a mercenary Big Guy without creating a player when the fallback position upsert fails', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 960 });
    const upsertPosition = vi.fn().mockResolvedValue(undefined);
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const mercenaryRosters: RosterEntry[] = [
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

  it('emits no starPositionUsages for a regular (non-star) roster player', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({ upsertPlayerResult });

    const { starPositionUsages } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      // no starPositionIds -> position 200 is not a star position
    });

    expect(starPositionUsages).toEqual([]);
  });

  it('emits a starPositionUsage for an embedded roster player whose position is a star position', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service } = await makeService({
      upsertPlayerResult,
      positionIdsByExternalId: new Map([['5002', 800]]),
    });
    const embeddedStarRosters: RosterEntry[] = [
      {
        era: 'Third Era',
        competition: 'comp',
        roster: {
          id: 123,
          teamName: 'Team 123',
          teamRaceCode: 'Dwarf',
          raceName: 'Dwarf',
          coachTpId: 'coach-1',
          positions: [],
          starPositions: [],
          players: [
            {
              id: 42,
              name: "Morg 'n' Thorg",
              number: 1,
              lineUpMasterId: 5002,
              rosterId: 123,
              fallbackPositionName: 'x',
              isBigGuy: false,
              totalStarPlayerPoints: 30,
            },
          ],
        },
      },
    ];

    const { starPositionUsages } = await service.importPlayers({
      rosters: embeddedStarRosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      starPositionIds: new Set([800]),
    });

    expect(starPositionUsages).toEqual([
      { positionId: 800, teamRaceCode: 'Dwarf', era: 'Third Era' },
    ]);
  });

  it('emits a starPositionUsage for a mercenary Big Guy resolved via the fallback position name', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 902 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 820 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });
    const mercRosters: RosterEntry[] = [
      {
        era: 'Third Era',
        competition: 'comp',
        roster: {
          id: 123,
          teamName: 'Team 123',
          teamRaceCode: 'Dwarf',
          raceName: 'Dwarf',
          coachTpId: 'coach-1',
          positions: [],
          starPositions: [],
          players: [
            {
              id: 55,
              name: 'Giant',
              number: 1,
              lineUpMasterId: 9999,
              rosterId: 123,
              fallbackPositionName: 'Giant',
              isBigGuy: true,
              totalStarPlayerPoints: 8,
            },
          ],
        },
      },
    ];

    const { starPositionUsages } = await service.importPlayers({
      rosters: mercRosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(starPositionUsages).toEqual([
      { positionId: 820, teamRaceCode: 'Dwarf', era: 'Third Era' },
    ]);
  });

  it('emits a starPositionUsage for an inducements-hired star player', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 901 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 810 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const { starPositionUsages } = await service.importPlayers({
      rosters, // roster 123 -> teamRaceCode 'Dwarf', era 'Third Era'
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      inducedStarPlayerHireGroups: [
        {
          rosterId: 123,
          eraId: 500,
          starPlayers: [
            { name: 'Griff Oberwald', lineUpMasterId: 7001, number: 1 },
          ],
        },
      ],
    });

    // The regular roster player (position 200) is NOT a star, so only the
    // induced star player contributes a usage.
    expect(starPositionUsages).toContainEqual({
      positionId: 810,
      teamRaceCode: 'Dwarf',
      era: 'Third Era',
    });
    expect(starPositionUsages).toHaveLength(1);
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
    const options = (rosterEntries: RosterEntry[], embeddedTotal: number) => ({
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
    const higherRosters: RosterEntry[] = [
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

  it('passes no sppTotal for an induced star player, whose TP data has no total', async () => {
    // TpInducedStarPlayer carries no totalStarPlayerPoints, so the column is
    // left untouched (NULL) rather than being written a made-up 0.
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 950 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 300 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    await service.importPlayers({
      rosters: [],
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      inducedStarPlayerHireGroups: [
        {
          rosterId: 123,
          eraId: 500,
          starPlayers: [
            { name: "Morg 'n' Thorg", lineUpMasterId: 5002, number: 16 },
          ],
        },
      ],
    });

    const payload = upsertPlayerResult.mock.calls[0][0] as {
      sppTotal?: number;
    };
    expect('sppTotal' in payload).toBe(false);
  });

  it('resolves every configured era in one batched call', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, lookup } = await makeService({ upsertPlayerResult });

    await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
    });

    expect(lookup.lookupMap).toHaveBeenCalledWith(
      'era',
      expect.arrayContaining([
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Third Era' },
        { externalSystemId: TP_SYSTEM_ID, externalId: 'Fourth Era' },
      ]),
    );
  });

  it('records one error and imports nothing when the era config cannot be read', async () => {
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

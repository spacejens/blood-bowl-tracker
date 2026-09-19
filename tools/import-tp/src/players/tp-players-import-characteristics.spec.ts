import type { RulesSet } from '@blood-bowl-tracker/api-contract';
import type { PlayerCharacteristicReductionCounts } from '@blood-bowl-tracker/import';
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
 * Same single-player roster as {@link rosterWith}, but also carrying the
 * `positionTemplate`/`lastingInjuries` fields `TpLastingInjuryBuilderService`
 * needs to derive a reduction count, which the increase-count wiring must
 * pass through to `PlayerCharacteristicIncreasesService.forPlayer`.
 */
function rosterWithReduction(): RosterEntry[] {
  const [entry] = rosterWith(OWN);
  return [
    {
      ...entry,
      roster: {
        ...entry.roster,
        players: [
          {
            ...entry.roster.players[0],
            // av 9 against the template's 10 is one active reduction.
            characteristics: { ...OWN, armour: 9 },
            positionTemplate: { ...OWN },
            lastingInjuries: { nigglingInjuries: 0, canPlayNextGame: true },
          },
        ],
      },
    },
  ];
}

/**
 * Same single-player roster as {@link rosterWith}, but also carrying a
 * `positionTemplate` -- the embedded baseline the increase-count wiring must
 * pass through as `PlayerCharacteristicIncreasesService.forPlayer`'s baseline
 * override, in preference to a separate DB read.
 */
function rosterWithTemplate(positionTemplate: typeof OWN): RosterEntry[] {
  const [entry] = rosterWith(OWN);
  return [
    {
      ...entry,
      roster: {
        ...entry.roster,
        players: [
          {
            ...entry.roster.players[0],
            positionTemplate,
          },
        ],
      },
    },
  ];
}

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

  it('does not reach for the mercenary fallback for a non-mercenary player without characteristics', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, mercenaryCharacteristics } = await makeService({
      upsertPlayerResult,
    });

    await service.importPlayers({
      rosters: rosterWith(undefined),
      teamErasByRosterId: teamEras,
    });

    expect(mercenaryCharacteristics.forRosterPlayer).not.toHaveBeenCalled();
  });
});

describe('TpPlayersImportService characteristic-increase counts', () => {
  it('sends the derived characteristic-increase counts with the player', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, characteristicIncreases } = await makeService({
      upsertPlayerResult,
    });
    characteristicIncreases.forPlayer.mockResolvedValue({
      moveIncreaseCount: 1,
      strengthIncreaseCount: 0,
      agilityIncreaseCount: 1,
      passingIncreaseCount: 0,
      armourIncreaseCount: 0,
    });

    await service.importPlayers({
      rosters: rosterWith(OWN),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        moveIncreaseCount: 1,
        agilityIncreaseCount: 1,
      }),
      expect.anything(),
    );
  });

  it("measures against the player's own resolved rules set", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, characteristicIncreases } = await makeService({
      upsertPlayerResult,
    });

    await service.importPlayers({
      rosters: rosterWith(OWN),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(characteristicIncreases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        rulesSet: expect.objectContaining({
          name: 'BB2020',
        }) as RulesSet,
      }),
    );
  });

  it('passes the derived reduction counts through', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, characteristicIncreases } = await makeService({
      upsertPlayerResult,
    });

    await service.importPlayers({
      rosters: rosterWithReduction(),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(characteristicIncreases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        reductions: expect.objectContaining({
          armourReductionCount: 1,
        }) as PlayerCharacteristicReductionCounts,
      }),
    );
  });

  it('sends no increase group for a player with no characteristics at all', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, characteristicIncreases } = await makeService({
      upsertPlayerResult,
    });

    await service.importPlayers({
      rosters: rosterWith(undefined),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(characteristicIncreases.forPlayer).not.toHaveBeenCalled();
    const payload = upsertPlayerResult.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('moveIncreaseCount');
  });

  it('sends no increase group when the era resolved to no single rules set', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, characteristicIncreases } = await makeService({
      upsertPlayerResult,
    });

    // rulesSetsByName omitted, so the rules set lookup yields undefined.
    await service.importPlayers({
      rosters: rosterWith(OWN),
      teamErasByRosterId: teamEras,
    });

    expect(characteristicIncreases.forPlayer).not.toHaveBeenCalled();
  });

  it('sends no increase group when no baseline could be resolved', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, characteristicIncreases } = await makeService({
      upsertPlayerResult,
    });
    characteristicIncreases.forPlayer.mockResolvedValue(undefined);

    await service.importPlayers({
      rosters: rosterWith(OWN),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    const payload = upsertPlayerResult.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('moveIncreaseCount');
  });

  it("passes the roster player's own embedded position template as the increase baseline, not the DB value", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, characteristicIncreases } = await makeService({
      upsertPlayerResult,
    });
    // The template disagrees with whatever `positionRulesSetsImport` would
    // return -- irrelevant here since it is mocked out entirely -- proving
    // this specific value is what's threaded through.
    const positionTemplate = {
      move: 5,
      strength: 4,
      agility: 3,
      passing: 6,
      armour: 8,
    };

    await service.importPlayers({
      rosters: rosterWithTemplate(positionTemplate),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(characteristicIncreases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        baseline: positionTemplate,
      }),
    );
  });

  it('falls back to no baseline override for a mercenary/star hire with no embedded position template', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const { service, characteristicIncreases } = await makeService({
      upsertPlayerResult,
    });

    await service.importPlayers({
      rosters: rosterWith(OWN),
      teamErasByRosterId: teamEras,
      rulesSetsByName,
    });

    expect(characteristicIncreases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ baseline: undefined }),
    );
  });

  it("converts the embedded template's literal-0 passing to null when the rules set declares no Passing characteristic", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const noPassingRulesSet: RulesSet = { ...bb2020, passingFormat: 'absent' };
    const { service, characteristicIncreases } = await makeService({
      upsertPlayerResult,
    });
    const positionTemplate = {
      move: 5,
      strength: 4,
      agility: 3,
      passing: 0,
      armour: 8,
    };

    await service.importPlayers({
      rosters: rosterWithTemplate(positionTemplate),
      teamErasByRosterId: teamEras,
      rulesSetsByName: new Map([['BB2020', noPassingRulesSet]]),
    });

    expect(characteristicIncreases.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        baseline: { ...positionTemplate, passing: null },
      }),
    );
  });
});

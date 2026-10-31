import { describe, expect, it } from 'vitest';

import {
  ImportTpRosterSchema,
  TpImportedPlayerSchema,
  TpRosterImportResultSchema,
} from './tp-roster';

const embedded = {
  id: 5001,
  name: 'Grim',
  number: 1,
  lineUpMasterId: 77,
  rosterId: 163386,
  fallbackPositionName: 'Lineman',
  isBigGuy: false,
  totalStarPlayerPoints: 12,
};

describe('ImportTpRosterSchema', () => {
  it('keeps the defer flag and reports each player total', () => {
    expect(
      ImportTpRosterSchema.parse({
        roster: {},
        era: 'Season 1',
        externalSystemName: 'TP',
        deferSppTotal: true,
      }).deferSppTotal,
    ).toBe(true);
    expect(
      TpImportedPlayerSchema.parse({
        lineUpId: 1,
        playerId: 2,
        created: true,
        reportedSppTotal: 14,
      }).reportedSppTotal,
    ).toBe(14);
  });

  it('accepts raw roster JSON and defaults matchEmbeddedPlayers to none', () => {
    const parsed = ImportTpRosterSchema.parse({
      roster: { id: 163386, anything: ['raw'] },
      era: 'Fourth era',
      externalSystemName: 'TP',
    });
    expect(parsed.matchEmbeddedPlayers).toEqual([]);
    expect(parsed.roster).toEqual({ id: 163386, anything: ['raw'] });
  });

  it('keeps only the fields a match-embedded player carries', () => {
    const parsed = ImportTpRosterSchema.parse({
      roster: {},
      era: 'Fourth era',
      externalSystemName: 'TP',
      matchEmbeddedPlayers: [{ ...embedded, skills: 'dropped' }],
    });
    expect(parsed.matchEmbeddedPlayers).toEqual([embedded]);
  });

  it("keeps a match-embedded player's state and isActive", () => {
    const parsed = ImportTpRosterSchema.parse({
      roster: {},
      era: 'Fourth era',
      externalSystemName: 'TP',
      matchEmbeddedPlayers: [{ ...embedded, state: 8209, isActive: false }],
    });
    expect(parsed.matchEmbeddedPlayers).toEqual([
      { ...embedded, state: 8209, isActive: false },
    ]);
  });

  it("keeps a match-embedded player's unspent starPlayerPoints", () => {
    const parsed = ImportTpRosterSchema.parse({
      roster: {},
      era: 'Fourth era',
      externalSystemName: 'TP',
      matchEmbeddedPlayers: [{ ...embedded, starPlayerPoints: 4 }],
    });
    expect(parsed.matchEmbeddedPlayers[0].starPlayerPoints).toBe(4);
  });

  it('accepts a match-embedded player without starPlayerPoints', () => {
    const parsed = ImportTpRosterSchema.parse({
      roster: {},
      era: 'Fourth era',
      externalSystemName: 'TP',
      matchEmbeddedPlayers: [embedded],
    });
    expect(parsed.matchEmbeddedPlayers[0].starPlayerPoints).toBeUndefined();
  });

  it('accepts a match-embedded player without state or isActive', () => {
    const parsed = ImportTpRosterSchema.parse({
      roster: {},
      era: 'Fourth era',
      externalSystemName: 'TP',
      matchEmbeddedPlayers: [embedded],
    });
    expect(parsed.matchEmbeddedPlayers[0].state).toBeUndefined();
    expect(parsed.matchEmbeddedPlayers[0].isActive).toBeUndefined();
  });

  it.each([-1, 1.5])('rejects a match-embedded state of %s', (state) => {
    expect(
      ImportTpRosterSchema.safeParse({
        roster: {},
        era: 'Fourth era',
        externalSystemName: 'TP',
        matchEmbeddedPlayers: [{ ...embedded, state }],
      }).success,
    ).toBe(false);
  });

  it('rejects an empty era or external system name', () => {
    expect(
      ImportTpRosterSchema.safeParse({
        roster: {},
        era: '',
        externalSystemName: 'TP',
      }).success,
    ).toBe(false);
    expect(
      ImportTpRosterSchema.safeParse({
        roster: {},
        era: 'Fourth era',
        externalSystemName: '',
      }).success,
    ).toBe(false);
  });
});

describe('TpRosterImportResultSchema', () => {
  it('accepts a full outcome', () => {
    const empty = { success: true, imported: 0, errors: [] };
    expect(
      TpRosterImportResultSchema.safeParse({
        team: { ...empty, imported: 1 },
        players: empty,
        teamEras: [{ id: 31, eraId: 40 }],
        importedPlayers: [
          {
            lineUpId: 5001,
            playerId: 700,
            created: true,
            reportedSppTotal: 12,
          },
        ],
        mercenaryPositionUsages: [
          { positionId: 55, teamRaceCode: 'orc', era: 'Fourth era' },
        ],
      }).success,
    ).toBe(true);
  });

  it('TpImportedPlayerSchema carries an optional unspent snapshot', () => {
    const base = {
      lineUpId: 5001,
      playerId: 700,
      created: true,
      reportedSppTotal: 20,
    };
    expect(TpImportedPlayerSchema.parse(base)).toEqual(base);
    expect(
      TpImportedPlayerSchema.parse({
        ...base,
        unspentSppSnapshot: { unspentSpp: 4, snapshotSppTotal: 12 },
      }).unspentSppSnapshot,
    ).toEqual({ unspentSpp: 4, snapshotSppTotal: 12 });
  });
});

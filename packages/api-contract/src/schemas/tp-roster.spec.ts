import { describe, expect, it } from 'vitest';

import { ImportTpRosterSchema, TpRosterImportResultSchema } from './tp-roster';

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
        importedPlayers: [{ lineUpId: 5001, playerId: 700, created: true }],
        mercenaryPositionUsages: [
          { positionId: 55, teamRaceCode: 'orc', era: 'Fourth era' },
        ],
      }).success,
    ).toBe(true);
  });
});

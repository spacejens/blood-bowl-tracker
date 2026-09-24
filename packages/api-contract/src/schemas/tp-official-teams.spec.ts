import { describe, expect, it } from 'vitest';

import {
  ImportTpOfficialTeamsSchema,
  TpOfficialTeamsImportResultSchema,
} from './tp-official-teams';

const characteristics = {
  move: 5,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
};

const input = {
  rulesSet: 'BB2025',
  races: [
    {
      name: 'Orc',
      teamRaceCode: 'orc25',
      isOfficial: true,
      positions: [
        {
          name: 'Blitzer',
          isStarPlayer: false,
          tpPositionId: 77,
          characteristics,
          skills: [
            { skillMasterId: 41 },
            { skillMasterId: 307, attributeValue: '111', attributeType: 3 },
            { name: 'Brutal Charge' },
          ],
          keywordCodes: [4, 12],
        },
      ],
    },
  ],
  externalSystemName: 'TP',
};

describe('ImportTpOfficialTeamsSchema', () => {
  it('accepts one rules set of parsed races, defaulting skillMasters to none', () => {
    const parsed = ImportTpOfficialTeamsSchema.parse(input);

    expect(parsed.races).toEqual(input.races);
    expect(parsed.skillMasters).toEqual([]);
  });

  it('accepts skill master names', () => {
    const parsed = ImportTpOfficialTeamsSchema.parse({
      ...input,
      skillMasters: [{ skillMasterId: 41, name: 'Block', isElite: true }],
    });

    expect(parsed.skillMasters).toEqual([
      { skillMasterId: 41, name: 'Block', isElite: true },
    ]);
  });

  it('rejects an empty rules set or external system name', () => {
    expect(
      ImportTpOfficialTeamsSchema.safeParse({ ...input, rulesSet: '' }).success,
    ).toBe(false);
    expect(
      ImportTpOfficialTeamsSchema.safeParse({
        ...input,
        externalSystemName: '',
      }).success,
    ).toBe(false);
  });

  it('rejects a skill reference with neither an id nor a name', () => {
    const races = [
      {
        ...input.races[0],
        positions: [{ ...input.races[0].positions[0], skills: [{}] }],
      },
    ];
    expect(
      ImportTpOfficialTeamsSchema.safeParse({ ...input, races }).success,
    ).toBe(false);
  });
});

describe('TpOfficialTeamsImportResultSchema', () => {
  const one = { success: true, imported: 1, errors: [] };

  it('requires one result per stage plus the position characteristics', () => {
    const result = {
      races: one,
      positions: one,
      characteristics: one,
      keywords: one,
      startingSkills: one,
      positionCharacteristics: [
        { positionId: 9, rulesSetId: 20, ...characteristics },
      ],
    };
    expect(TpOfficialTeamsImportResultSchema.safeParse(result).success).toBe(
      true,
    );
    const { keywords: _keywords, ...missingStage } = result;
    expect(
      TpOfficialTeamsImportResultSchema.safeParse(missingStage).success,
    ).toBe(false);
  });
});

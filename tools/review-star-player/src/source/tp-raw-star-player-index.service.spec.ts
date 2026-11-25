import { TpFilesReaderService } from '@blood-bowl-tracker/read-tp-files';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import type { TpTeamsFixture } from './tp-files-fixtures.test-helpers';
import { stubTpFiles } from './tp-files-fixtures.test-helpers';
import { TpRawStarPlayerIndexService } from './tp-raw-star-player-index.service';

/**
 * The canned files the mocked reader lists and reads, in the order added: the
 * order a test states is the order the reader's sorted listing would give.
 */
let teams: TpTeamsFixture[];

function writeRulesSet(rulesSet: string, contents: unknown): void {
  teams.push({ rulesSet, name: 'rosters_masters.json', body: contents });
}

const WOOD_ELF = {
  teamRace: 'WoodElf_BB2025',
  teamRosterType: 0,
  name: 'Wood Elf',
  leagues: 256,
  selectableLeagues: 0,
  teamSpecialRules: 0,
  selectableTeamSpecialRules: 0,
  lineUpMasters: [],
};

const DWARF = {
  teamRace: 'Dwarf_BB2025',
  teamRosterType: 0,
  name: 'Dwarf',
  leagues: 1,
  selectableLeagues: 0,
  teamSpecialRules: 4,
  selectableTeamSpecialRules: 0,
  lineUpMasters: [],
};

const ELDRIL = {
  position: 'Eldril Sidewinder',
  isStarPlayer: true,
  cost: 220000,
  ma: 8,
  st: 3,
  ag: 2,
  pa: 5,
  av: 8,
  specialRuleName: 'Elven Kingdoms League',
  availableLeagues: 256,
};

describe('TpRawStarPlayerIndexService', () => {
  let service: TpRawStarPlayerIndexService;
  let tpFiles: MockProxy<TpFilesReaderService>;

  beforeEach(async () => {
    teams = [];
    const config = mock<StarPlayerReviewConfigService>();
    config.getDataDir.mockReturnValue('/data/tp');
    tpFiles = mock<TpFilesReaderService>();
    stubTpFiles(tpFiles, { teams });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRawStarPlayerIndexService,
        { provide: TpFilesReaderService, useValue: tpFiles },
        { provide: StarPlayerReviewConfigService, useValue: config },
        StarPlayerNameMatcherService,
      ],
    }).compile();
    service = moduleRef.get(TpRawStarPlayerIndexService);
  });

  it('indexes a star by name with its rules-set entry', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF, DWARF],
      starplayerMasters: [ELDRIL],
    });

    expect(await service.starFor('Eldril Sidewinder')).toEqual({
      name: 'Eldril Sidewinder',
      entries: [
        {
          rulesSet: 'BB2025',
          cost: 220000,
          specialRuleName: 'Elven Kingdoms League',
          characteristics: {
            move: 8,
            strength: 3,
            agility: 2,
            passing: 5,
            armour: 8,
          },
          eligibleTeamRaces: ['WoodElf_BB2025'],
          skills: [],
          keywordCodes: [],
          positionTypes: null,
          isBigGuy: false,
        },
      ],
    });
  });

  it('matches a star to a roster through the team-special-rule mask', async () => {
    writeRulesSet('BB2020', {
      rosterMasters: [WOOD_ELF, DWARF],
      starplayerMasters: [
        { ...ELDRIL, availableLeagues: 0, availableTeamSpecialRules: 4 },
      ],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.eligibleTeamRaces).toEqual(['Dwarf_BB2025']);
  });

  it('matches through a selectable mask too', async () => {
    writeRulesSet('BB2020', {
      rosterMasters: [
        { ...DWARF, teamSpecialRules: 0, selectableTeamSpecialRules: 4 },
      ],
      starplayerMasters: [
        { ...ELDRIL, availableLeagues: 0, availableTeamSpecialRules: 4 },
      ],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.eligibleTeamRaces).toEqual(['Dwarf_BB2025']);
  });

  it('ignores non-canonical rosters when deciding eligibility', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [{ ...WOOD_ELF, teamRosterType: 4 }],
      starplayerMasters: [ELDRIL],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.eligibleTeamRaces).toEqual([]);
  });

  it('collects one entry per rules set the star appears in', async () => {
    writeRulesSet('BB2020', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [{ ...ELDRIL, cost: 200000 }],
    });
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries.map((entry) => [entry.rulesSet, entry.cost])).toEqual([
      ['BB2020', 200000],
      ['BB2025', 220000],
    ]);
  });

  it('keeps entries in the order the reader lists the rules sets', async () => {
    writeRulesSet('BB2020', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [{ ...ELDRIL, cost: 200000 }],
    });
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries.map((entry) => entry.rulesSet)).toEqual([
      'BB2020',
      'BB2025',
    ]);
  });

  it('indexes the files within a rules set in the order the reader lists them', async () => {
    teams.push(
      {
        rulesSet: 'BB2025',
        name: 'aaa_first.json',
        body: {
          rosterMasters: [WOOD_ELF],
          starplayerMasters: [{ ...ELDRIL, position: 'Aaron Apple' }],
        },
      },
      {
        rulesSet: 'BB2025',
        name: 'zzz_last.json',
        body: {
          rosterMasters: [WOOD_ELF],
          starplayerMasters: [{ ...ELDRIL, position: 'Zed Zebra' }],
        },
      },
    );

    expect(await service.allNames()).toEqual(['Aaron Apple', 'Zed Zebra']);
  });

  it('falls back to a normalized name match when the exact spelling differs', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF, DWARF],
      starplayerMasters: [
        { ...ELDRIL, position: 'Dolfar Longstride (& Grak)' },
      ],
    });

    const star = await service.starFor('Dolfar Longstride');

    expect(star?.name).toBe('Dolfar Longstride (& Grak)');
  });

  it('returns null for a star TP does not carry', async () => {
    writeRulesSet('BB2025', { rosterMasters: [], starplayerMasters: [] });

    expect(await service.starFor('Nobody At All')).toBeNull();
  });

  it('lists every star name it indexed', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL, { ...ELDRIL, position: 'Griff Oberwald' }],
    });

    expect(await service.allNames()).toEqual([
      'Eldril Sidewinder',
      'Griff Oberwald',
    ]);
  });

  it('degrades to an empty index when the teams directory is absent', async () => {
    expect(await service.allNames()).toEqual([]);
  });

  it('skips a file that is not readable JSON', async () => {
    teams.push({
      rulesSet: 'BB2025',
      name: 'broken.json',
      body: new Error('Failed to parse TP file broken.json: { not json'),
    });

    expect(await service.allNames()).toEqual([]);
  });

  it('skips a starplayerMasters entry with no usable name', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [{ ...ELDRIL, position: '' }],
    });

    expect(await service.allNames()).toEqual([]);
  });

  it('reports null characteristics when a characteristic is missing', async () => {
    const { ma: _ma, ...withoutMove } = ELDRIL;
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [withoutMove],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.characteristics).toBeNull();
  });

  it('propagates a non-ENOENT error reading the teams directory', async () => {
    tpFiles.listTeamsRulesSets.mockRejectedValue(
      Object.assign(new Error('ENOTDIR: not a directory'), {
        code: 'ENOTDIR',
      }),
    );

    await expect(service.allNames()).rejects.toThrow(/ENOTDIR/);
  });

  it("reads a star entry's skill refs with their attribute values", async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [
        {
          ...ELDRIL,
          skills: [
            { skillMasterId: 196 },
            {
              skillMasterId: 278,
              skillAttributeMaster: { value: '4+', type: 0 },
            },
          ],
        },
      ],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.skills).toEqual([
      { skillMasterId: 196, attributeValue: null },
      { skillMasterId: 278, attributeValue: '4+' },
    ]);
  });

  it('reports no skills for a star entry with no skills array', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.skills).toEqual([]);
  });

  it("reads a star entry's keyword codes from its race array", async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [{ ...ELDRIL, race: [111, 110] }],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.keywordCodes).toEqual([111, 110]);
  });

  it('reports no keyword codes for an entry with no race array', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.keywordCodes).toEqual([]);
  });

  it('yields no keyword codes rather than throwing for a non-array race value', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [{ ...ELDRIL, race: 'not-an-array' }],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.keywordCodes).toEqual([]);
  });

  it("decodes a star entry's positionTypes bits into keyword codes", async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      // 64 = Special, the keyword Dribl and Drull carry under the rulebook and
      // TP never puts in the race array.
      starplayerMasters: [{ ...ELDRIL, race: [130], positionTypes: 64 }],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.keywordCodes).toEqual([130, 64]);
    expect(star?.entries[0]?.positionTypes).toBe(64);
    expect(star?.entries[0]?.isBigGuy).toBe(false);
  });

  it("decodes a star entry's isBigGuy flag into the Big Guy keyword code", async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [
        { ...ELDRIL, race: [116], positionTypes: null, isBigGuy: true },
      ],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.keywordCodes).toEqual([116, 134]);
    expect(star?.entries[0]?.positionTypes).toBeNull();
    expect(star?.entries[0]?.isBigGuy).toBe(true);
  });

  it('gives the Big Guy keyword code for a BB2020-shaped entry with isBigGuy but no race or positionTypes', async () => {
    // Real shape from BB2020 data: isBigGuy true, no race array, no
    // positionTypes.
    writeRulesSet('BB2020', {
      rosterMasters: [{ ...DWARF, teamRace: 'Dwarf' }],
      starplayerMasters: [{ ...ELDRIL, isBigGuy: true }],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.isBigGuy).toBe(true);
    expect(star?.entries[0]?.keywordCodes).toEqual([134]);
  });

  it('decodes a recognized positionTypes bit for a DB2021-shaped entry with no race or isBigGuy', async () => {
    // Real shape from DB2021 data: positionTypes carries a recognized bit,
    // no race array, no isBigGuy.
    writeRulesSet('DB2021', {
      rosterMasters: [{ ...DWARF, teamRace: 'Dwarf' }],
      starplayerMasters: [{ ...ELDRIL, positionTypes: 32 }],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.keywordCodes).toEqual([32]);
  });

  it('adds the Big Guy code for a DB2021-shaped entry with positionTypes bit 128 alone', async () => {
    // Real shape from DB2021 data: bit 128 is DB2021's own Big Guy signal, no
    // isBigGuy set.
    writeRulesSet('DB2021', {
      rosterMasters: [{ ...DWARF, teamRace: 'Dwarf' }],
      starplayerMasters: [{ ...ELDRIL, positionTypes: 128 }],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.keywordCodes).toEqual([134]);
  });

  it('adds the Big Guy code once for a DB2021-shaped entry with both positionTypes bit 128 and isBigGuy', async () => {
    writeRulesSet('DB2021', {
      rosterMasters: [{ ...DWARF, teamRace: 'Dwarf' }],
      starplayerMasters: [{ ...ELDRIL, positionTypes: 128, isBigGuy: true }],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.keywordCodes).toEqual([134]);
  });

  it('reports no positional data for a star entry carrying neither field', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.positionTypes).toBeNull();
    expect(star?.entries[0]?.isBigGuy).toBe(false);
    expect(star?.entries[0]?.keywordCodes).toEqual([]);
  });

  it('yields no positional codes rather than throwing for a non-numeric positionTypes', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [{ ...ELDRIL, race: [116], positionTypes: 'special' }],
    });

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.keywordCodes).toEqual([116]);
    expect(star?.entries[0]?.positionTypes).toBeNull();
  });

  it('scans the mirror only once per process', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL],
    });

    await service.starFor('Eldril Sidewinder');
    teams.length = 0;

    expect(await service.starFor('Eldril Sidewinder')).not.toBeNull();
    expect(tpFiles.listTeamsRulesSets).toHaveBeenCalledTimes(1);
  });
});

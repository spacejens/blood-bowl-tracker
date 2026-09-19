import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { TpRawStarPlayerIndexService } from './tp-raw-star-player-index.service';

let dir: string;

function writeRulesSet(rulesSet: string, contents: unknown): void {
  const rulesSetDir = join(dir, 'teams', rulesSet);
  mkdirSync(rulesSetDir, { recursive: true });
  writeFileSync(
    join(rulesSetDir, 'rosters_masters.json'),
    JSON.stringify(contents),
    'utf8',
  );
}

async function makeService(): Promise<TpRawStarPlayerIndexService> {
  const config = mock<StarPlayerReviewConfigService>();
  config.getDataDir.mockReturnValue(dir);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpRawStarPlayerIndexService,
      { provide: StarPlayerReviewConfigService, useValue: config },
      StarPlayerNameMatcherService,
    ],
  }).compile();
  return moduleRef.get(TpRawStarPlayerIndexService);
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-star-player-tp-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('TpRawStarPlayerIndexService', () => {
  it('indexes a star by name with its rules-set entry', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF, DWARF],
      starplayerMasters: [ELDRIL],
    });
    const service = await makeService();

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
    const service = await makeService();

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
    const service = await makeService();

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.eligibleTeamRaces).toEqual(['Dwarf_BB2025']);
  });

  it('ignores non-canonical rosters when deciding eligibility', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [{ ...WOOD_ELF, teamRosterType: 4 }],
      starplayerMasters: [ELDRIL],
    });
    const service = await makeService();

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
    const service = await makeService();

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries.map((entry) => [entry.rulesSet, entry.cost])).toEqual([
      ['BB2020', 200000],
      ['BB2025', 220000],
    ]);
  });

  it('orders entries by rules-set name regardless of write order', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL],
    });
    writeRulesSet('BB2020', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [{ ...ELDRIL, cost: 200000 }],
    });
    const service = await makeService();

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries.map((entry) => entry.rulesSet)).toEqual([
      'BB2020',
      'BB2025',
    ]);
  });

  it('orders files within a rules set by file name regardless of write order', async () => {
    const rulesSetDir = join(dir, 'teams', 'BB2025');
    mkdirSync(rulesSetDir, { recursive: true });
    writeFileSync(
      join(rulesSetDir, 'zzz_last.json'),
      JSON.stringify({
        rosterMasters: [WOOD_ELF],
        starplayerMasters: [{ ...ELDRIL, position: 'Zed Zebra' }],
      }),
      'utf8',
    );
    writeFileSync(
      join(rulesSetDir, 'aaa_first.json'),
      JSON.stringify({
        rosterMasters: [WOOD_ELF],
        starplayerMasters: [{ ...ELDRIL, position: 'Aaron Apple' }],
      }),
      'utf8',
    );
    const service = await makeService();

    expect(await service.allNames()).toEqual(['Aaron Apple', 'Zed Zebra']);
  });

  it('falls back to a normalized name match when the exact spelling differs', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF, DWARF],
      starplayerMasters: [
        { ...ELDRIL, position: 'Dolfar Longstride (& Grak)' },
      ],
    });
    const service = await makeService();

    const star = await service.starFor('Dolfar Longstride');

    expect(star?.name).toBe('Dolfar Longstride (& Grak)');
  });

  it('returns null for a star TP does not carry', async () => {
    writeRulesSet('BB2025', { rosterMasters: [], starplayerMasters: [] });
    const service = await makeService();

    expect(await service.starFor('Nobody At All')).toBeNull();
  });

  it('lists every star name it indexed', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL, { ...ELDRIL, position: 'Griff Oberwald' }],
    });
    const service = await makeService();

    expect(await service.allNames()).toEqual([
      'Eldril Sidewinder',
      'Griff Oberwald',
    ]);
  });

  it('degrades to an empty index when the teams directory is absent', async () => {
    const service = await makeService();

    expect(await service.allNames()).toEqual([]);
  });

  it('skips a file that is not readable JSON', async () => {
    const rulesSetDir = join(dir, 'teams', 'BB2025');
    mkdirSync(rulesSetDir, { recursive: true });
    writeFileSync(join(rulesSetDir, 'broken.json'), '{ not json', 'utf8');
    const service = await makeService();

    expect(await service.allNames()).toEqual([]);
  });

  it('skips a starplayerMasters entry with no usable name', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [{ ...ELDRIL, position: '' }],
    });
    const service = await makeService();

    expect(await service.allNames()).toEqual([]);
  });

  it('reports null characteristics when a characteristic is missing', async () => {
    const { ma: _ma, ...withoutMove } = ELDRIL;
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [withoutMove],
    });
    const service = await makeService();

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.characteristics).toBeNull();
  });

  it('propagates a non-ENOENT error reading the teams directory', async () => {
    writeFileSync(join(dir, 'teams'), 'not a directory', 'utf8');
    const service = await makeService();

    await expect(service.allNames()).rejects.toThrow();
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
    const service = await makeService();

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
    const service = await makeService();

    const star = await service.starFor('Eldril Sidewinder');

    expect(star?.entries[0]?.skills).toEqual([]);
  });

  it('scans the mirror only once per process', async () => {
    writeRulesSet('BB2025', {
      rosterMasters: [WOOD_ELF],
      starplayerMasters: [ELDRIL],
    });
    const service = await makeService();

    await service.starFor('Eldril Sidewinder');
    rmSync(join(dir, 'teams'), { recursive: true, force: true });

    expect(await service.starFor('Eldril Sidewinder')).not.toBeNull();
  });
});

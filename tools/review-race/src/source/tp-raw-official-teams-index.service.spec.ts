import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { TpRawOfficialTeamsIndexService } from './tp-raw-official-teams-index.service';

/** The one file each `teams/<rulesSet>/` folder holds, named as TP serves it. */
const FILE_NAME = 'rosters_masters?ruleSet=25.json';

describe('TpRawOfficialTeamsIndexService', () => {
  let service: TpRawOfficialTeamsIndexService;
  let config: ReturnType<typeof mock<RaceReviewConfigService>>;
  let tempDir: string;

  beforeEach(async () => {
    config = mock<RaceReviewConfigService>();
    tempDir = mkdtempSync(join(tmpdir(), 'tp-official-teams-index-test-'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRawOfficialTeamsIndexService,
        { provide: RaceReviewConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(TpRawOfficialTeamsIndexService);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  /** A real-shaped `lineUpMasters[]` entry, trimmed to the read fields. */
  function lineman(overrides: Record<string, unknown> = {}): unknown {
    return {
      id: 929,
      rosterMasterId: 152,
      position: 'Dwarf Blocker',
      quantity: 16,
      cost: 70000,
      ma: 4,
      st: 3,
      ag: 4,
      pa: 5,
      av: 10,
      skills: [],
      ...overrides,
    };
  }

  /** A real-shaped official `rosterMasters[]` entry. */
  function roster(overrides: Record<string, unknown> = {}): unknown {
    return {
      id: 152,
      name: 'Dwarf',
      teamRace: 'Dwarf_BB2025',
      teamRosterType: 0,
      ruleSet: 25,
      tier: 2,
      teamSpecialRules: 256,
      selectableTeamSpecialRules: 0,
      leagues: 1,
      selectableLeagues: 0,
      lineUpMasters: [lineman()],
      ...overrides,
    };
  }

  /** A real-shaped `starplayerMasters[]` entry. */
  function star(overrides: Record<string, unknown> = {}): unknown {
    return {
      id: 41,
      position: 'Grim Ironjaw',
      isStarPlayer: true,
      cost: 250000,
      availableLeagues: 1,
      availableTeamSpecialRules: 0,
      race: [100],
      ma: 6,
      st: 4,
      ag: 3,
      pa: 5,
      av: 9,
      skills: [],
      ...overrides,
    };
  }

  /** Write one rules-set folder's official-team-list response. */
  function write(
    rulesSet: string,
    body: {
      rosterMasters?: unknown[];
      starplayerMasters?: unknown[];
    },
    fileName = FILE_NAME,
  ): void {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'teams', rulesSet), { recursive: true });
    writeFileSync(
      join(dataDir, 'teams', rulesSet, fileName),
      JSON.stringify({
        rosterMasters: [],
        starplayerMasters: [],
        inducementsMasters: [],
        ...body,
      }),
    );
    config.getDataDir.mockReturnValue(dataDir);
  }

  it('returns null for a race code no official list carries', async () => {
    write('BB2025', { rosterMasters: [roster()] });

    expect(await service.raceFor('Ogre_BB2025')).toBeNull();
  });

  it('reads a race name, its rules sets and its positions from one rules set folder', async () => {
    write('BB2025', { rosterMasters: [roster()] });

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race).toEqual({
      teamRaceCode: 'Dwarf_BB2025',
      raceName: 'Dwarf',
      rulesSets: ['BB2025'],
      positions: [
        {
          name: 'Dwarf Blocker',
          isStar: false,
          rulesSet: 'BB2025',
          tpPositionId: 929,
          characteristics: {
            move: 4,
            strength: 3,
            agility: 4,
            passing: 5,
            armour: 10,
          },
        },
      ],
    });
  });

  it('unions a code appearing under several rules set folders', async () => {
    const dataDir = join(tempDir, 'data');
    for (const [rulesSet, position] of [
      ['BB2020', 'Dwarf Blocker'],
      ['BB2025', 'Dwarf Runner'],
    ]) {
      mkdirSync(join(dataDir, 'teams', rulesSet ?? ''), { recursive: true });
      writeFileSync(
        join(dataDir, 'teams', rulesSet ?? '', FILE_NAME),
        JSON.stringify({
          rosterMasters: [roster({ lineUpMasters: [lineman({ position })] })],
          starplayerMasters: [],
        }),
      );
    }
    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.rulesSets).toEqual(['BB2020', 'BB2025']);
    expect(
      race?.positions.map((entry) => [entry.rulesSet, entry.name]),
    ).toEqual([
      ['BB2020', 'Dwarf Blocker'],
      ['BB2025', 'Dwarf Runner'],
    ]);
  });

  it('flags a star player entry as isStar', async () => {
    write('BB2025', {
      rosterMasters: [roster()],
      starplayerMasters: [star()],
    });

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.positions).toContainEqual({
      name: 'Grim Ironjaw',
      isStar: true,
      rulesSet: 'BB2025',
      tpPositionId: 41,
      characteristics: {
        move: 6,
        strength: 4,
        agility: 3,
        passing: 5,
        armour: 9,
      },
    });
  });

  it('carries a null tpPositionId when the official list has no numeric id', async () => {
    write('BB2025', {
      rosterMasters: [roster({ lineUpMasters: [lineman({ id: undefined })] })],
    });

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.positions[0]?.tpPositionId).toBeNull();
  });

  it('deduplicates a position repeated within one rules set', async () => {
    write('BB2025', {
      rosterMasters: [
        roster({ lineUpMasters: [lineman(), lineman({ id: 930 })] }),
      ],
    });

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.positions).toHaveLength(1);
    expect(race?.positions[0]?.tpPositionId).toBe(929);
  });

  it('keeps the same position name under two rules sets as two entries', async () => {
    const dataDir = join(tempDir, 'data');
    for (const [rulesSet, armour] of [
      ['BB2020', 9],
      ['BB2025', 10],
    ] as [string, number][]) {
      mkdirSync(join(dataDir, 'teams', rulesSet), { recursive: true });
      writeFileSync(
        join(dataDir, 'teams', rulesSet, FILE_NAME),
        JSON.stringify({
          rosterMasters: [roster({ lineUpMasters: [lineman({ av: armour })] })],
          starplayerMasters: [],
        }),
      );
    }
    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    expect(
      race?.positions.map((entry) => [
        entry.rulesSet,
        entry.characteristics.armour,
      ]),
    ).toEqual([
      ['BB2020', 9],
      ['BB2025', 10],
    ]);
  });

  it('skips a malformed entry rather than throwing', async () => {
    write('BB2025', {
      rosterMasters: [
        roster({
          lineUpMasters: [
            lineman({ position: 'Bad Blocker', ma: 'slow' }),
            lineman(),
          ],
        }),
        roster({ teamRace: undefined, name: 'Nameless' }),
        'not an object',
      ],
    });

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.positions.map((entry) => entry.name)).toEqual([
      'Dwarf Blocker',
    ]);
  });

  it('returns null when the teams directory does not exist', async () => {
    config.getDataDir.mockReturnValue(join(tempDir, 'nonexistent'));

    expect(await service.raceFor('Dwarf_BB2025')).toBeNull();
  });

  it('keeps legacy rosters alongside the official ones', async () => {
    write('BB2025', {
      rosterMasters: [
        roster({ teamRace: 'HighElf_BB2025_Legacy', teamRosterType: 1 }),
      ],
    });

    expect(await service.raceFor('HighElf_BB2025_Legacy')).not.toBeNull();
  });

  it('ignores Secret Bowl and experimental rosters', async () => {
    write('BB2025', {
      rosterMasters: [
        roster({ teamRace: 'Gnome_BB2025_SecretBowl', teamRosterType: 3 }),
        roster({ teamRace: 'Khemri_BB2025_Exp', teamRosterType: 4 }),
        roster(),
      ],
    });

    expect(await service.raceFor('Gnome_BB2025_SecretBowl')).toBeNull();
    expect(await service.raceFor('Khemri_BB2025_Exp')).toBeNull();
    expect(await service.raceFor('Dwarf_BB2025')).not.toBeNull();
  });

  it('omits a star no bitmask makes available to the race', async () => {
    write('BB2025', {
      rosterMasters: [roster({ leagues: 2, teamSpecialRules: 4 })],
      starplayerMasters: [
        star({ availableLeagues: 1, availableTeamSpecialRules: 8 }),
      ],
    });

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.positions.map((entry) => entry.name)).toEqual([
      'Dwarf Blocker',
    ]);
  });

  it('includes a star made available by a selectable team special rule', async () => {
    write('BB2025', {
      rosterMasters: [
        roster({
          teamRace: 'Norse_BB2025',
          name: 'Norse',
          leagues: undefined,
          selectableLeagues: undefined,
          teamSpecialRules: 0,
          selectableTeamSpecialRules: 1024,
        }),
      ],
      starplayerMasters: [
        star({
          position: 'Max Spleenripper',
          availableLeagues: 0,
          availableTeamSpecialRules: 1024,
        }),
      ],
    });

    const race = await service.raceFor('Norse_BB2025');

    expect(race?.positions.map((entry) => entry.name)).toContain(
      'Max Spleenripper',
    );
  });

  it('includes a star made available by a selectable league', async () => {
    write('BB2025', {
      rosterMasters: [
        roster({ leagues: 0, selectableLeagues: 256, teamSpecialRules: 0 }),
      ],
      starplayerMasters: [
        star({
          position: 'Deeproot Strongbranch',
          availableLeagues: 256,
          availableTeamSpecialRules: 0,
        }),
      ],
    });

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.positions.map((entry) => entry.name)).toContain(
      'Deeproot Strongbranch',
    );
  });

  it('reads a rules set whose file has no starplayerMasters array', async () => {
    write('DB2021', {
      rosterMasters: [
        roster({ teamRace: 'CollegeOfFire', name: 'College of Fire' }),
      ],
      starplayerMasters: undefined,
    });

    const race = await service.raceFor('CollegeOfFire');

    expect(race?.raceName).toBe('College of Fire');
    expect(race?.positions).toHaveLength(1);
  });

  it('sets raceName to null when the roster carries no name', async () => {
    write('BB2025', { rosterMasters: [roster({ name: 42 })] });

    expect((await service.raceFor('Dwarf_BB2025'))?.raceName).toBeNull();
  });

  it('skips a file whose JSON does not parse', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'teams', 'BB2025'), { recursive: true });
    writeFileSync(join(dataDir, 'teams', 'BB2025', FILE_NAME), 'not json');
    config.getDataDir.mockReturnValue(dataDir);

    expect(await service.raceFor('Dwarf_BB2025')).toBeNull();
  });

  it('ignores files that are not JSON', async () => {
    write('BB2025', { rosterMasters: [roster()] }, 'notes.txt');

    expect(await service.raceFor('Dwarf_BB2025')).toBeNull();
  });

  it('rethrows a listing failure that is not a missing directory', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, 'teams'), '');
    config.getDataDir.mockReturnValue(dataDir);

    await expect(service.raceFor('Dwarf_BB2025')).rejects.toThrow();
  });

  it('caches the index across multiple raceFor calls', async () => {
    write('BB2025', { rosterMasters: [roster()] });

    const first = await service.raceFor('Dwarf_BB2025');
    rmSync(join(tempDir, 'data'), { recursive: true });
    const second = await service.raceFor('Dwarf_BB2025');

    expect(second).toEqual(first);
  });
});

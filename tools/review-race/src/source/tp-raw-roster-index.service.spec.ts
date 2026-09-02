import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { TpRawRosterIndexService } from './tp-raw-roster-index.service';

describe('TpRawRosterIndexService', () => {
  let service: TpRawRosterIndexService;
  let config: ReturnType<typeof mock<RaceReviewConfigService>>;
  let tempDir: string;

  beforeEach(async () => {
    config = mock<RaceReviewConfigService>();
    tempDir = mkdtempSync('tp-roster-index-test-');

    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRawRosterIndexService,
        { provide: RaceReviewConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(TpRawRosterIndexService);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function roster(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      id: 1,
      teamName: 'Bockar',
      teamRace: 'Dwarf_BB2025',
      rosterMaster: {
        name: 'Dwarf',
        lineUpMasters: [
          {
            id: 952,
            position: 'Dwarf Lineman',
            ma: 4,
            st: 3,
            ag: 4,
            pa: 5,
            av: 10,
          },
        ],
        starPlayersMasters: [
          {
            id: 41,
            position: 'Grim Ironjaw',
            ma: 6,
            st: 4,
            ag: 3,
            pa: 5,
            av: 9,
          },
        ],
      },
      ...overrides,
    });
  }

  it('returns a race with rosterName and rosterCount from a single roster file', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });
    writeFileSync(join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'), roster());

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race).toMatchObject({
      teamRaceCode: 'Dwarf_BB2025',
      rosterName: 'Dwarf',
      rosterCount: 1,
    });
  });

  it('includes line-up masters as isStar: false with mapped characteristics', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });
    writeFileSync(join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'), roster());

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    const lineman = race?.positions.find((p) => p.tpPositionId === 952);
    expect(lineman).toMatchObject({
      tpPositionId: 952,
      name: 'Dwarf Lineman',
      isStar: false,
      characteristics: {
        move: 4,
        strength: 3,
        agility: 4,
        passing: 5,
        armour: 10,
      },
    });
  });

  it('includes star masters as isStar: true with mapped characteristics', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });
    writeFileSync(join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'), roster());

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    const starPlayer = race?.positions.find((p) => p.tpPositionId === 41);
    expect(starPlayer).toMatchObject({
      tpPositionId: 41,
      name: 'Grim Ironjaw',
      isStar: true,
      characteristics: {
        move: 6,
        strength: 4,
        agility: 3,
        passing: 5,
        armour: 9,
      },
    });
  });

  it('deduplicates positions by tpPositionId across multiple rosters', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });

    const roster1 = roster({
      id: 1,
      rosterMaster: {
        name: 'Dwarf',
        lineUpMasters: [
          {
            id: 952,
            position: 'Dwarf Lineman',
            ma: 4,
            st: 3,
            ag: 4,
            pa: 5,
            av: 10,
          },
        ],
        starPlayersMasters: [],
      },
    });

    const roster2 = roster({
      id: 2,
      rosterMaster: {
        name: 'Dwarf',
        lineUpMasters: [
          {
            id: 952,
            position: 'Dwarf Lineman',
            ma: 4,
            st: 3,
            ag: 4,
            pa: 5,
            av: 10,
          },
          {
            id: 953,
            position: 'Dwarf Blocker',
            ma: 3,
            st: 4,
            ag: 3,
            pa: 4,
            av: 11,
          },
        ],
        starPlayersMasters: [],
      },
    });

    writeFileSync(join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'), roster1);
    writeFileSync(join(dataDir, 'era-1', 'comp-a', 'rosters_2.json'), roster2);

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.rosterCount).toBe(2);
    expect(race?.positions).toHaveLength(2);
    const ids = race?.positions.map((p) => p.tpPositionId).sort();
    expect(ids).toEqual([952, 953]);
  });

  it('returns null for a race code with no rosters', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });
    writeFileSync(join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'), roster());

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Nope');

    expect(race).toBeNull();
  });

  it('ignores files not named rosters_*.json', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });

    const dwarfRoster = roster({
      teamRace: 'Dwarf_BB2025',
    });

    const otherFile = JSON.stringify({
      id: 1,
      teamRace: 'Elf_BB2025',
      rosterMaster: { name: 'Elf', lineUpMasters: [], starPlayersMasters: [] },
    });

    writeFileSync(
      join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'),
      dwarfRoster,
    );
    writeFileSync(join(dataDir, 'era-1', 'comp-a', 'match_1.json'), otherFile);

    config.getDataDir.mockReturnValue(dataDir);

    const elfRace = await service.raceFor('Elf_BB2025');
    expect(elfRace).toBeNull();
  });

  it('skips malformed JSON files and continues processing', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });

    writeFileSync(
      join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'),
      'not valid json',
    );
    writeFileSync(
      join(dataDir, 'era-1', 'comp-a', 'rosters_2.json'),
      roster({
        teamRace: 'Dwarf_BB2025',
      }),
    );

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race).toMatchObject({
      teamRaceCode: 'Dwarf_BB2025',
      rosterCount: 1,
    });
  });

  it('skips roster entries missing teamRace', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });

    const invalidRoster = JSON.stringify({
      id: 1,
      rosterMaster: {
        name: 'Dwarf',
        lineUpMasters: [],
        starPlayersMasters: [],
      },
    });

    const validRoster = roster({
      teamRace: 'Dwarf_BB2025',
    });

    writeFileSync(
      join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'),
      invalidRoster,
    );
    writeFileSync(
      join(dataDir, 'era-1', 'comp-a', 'rosters_2.json'),
      validRoster,
    );

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race).toMatchObject({
      teamRaceCode: 'Dwarf_BB2025',
      rosterCount: 1,
    });
  });

  it('skips line-up masters with non-numeric characteristics', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });

    const rosterWithInvalidLineup = roster({
      rosterMaster: {
        name: 'Dwarf',
        lineUpMasters: [
          {
            id: 952,
            position: 'Dwarf Lineman',
            ma: 4,
            st: 3,
            ag: 4,
            pa: 5,
            av: 10,
          },
          {
            id: 953,
            position: 'Bad Blocker',
            ma: 'slow',
            st: 3,
            ag: 4,
            pa: 5,
            av: 10,
          },
        ],
        starPlayersMasters: [],
      },
    });

    writeFileSync(
      join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'),
      rosterWithInvalidLineup,
    );

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.positions).toHaveLength(1);
    expect(race?.positions[0]?.tpPositionId).toBe(952);
  });

  it('sets rosterName to null when rosterMaster.name is absent or not a string', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });
    writeFileSync(
      join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'),
      roster({ rosterMaster: { lineUpMasters: [], starPlayersMasters: [] } }),
    );

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.rosterName).toBeNull();
  });

  it('treats a non-array lineUpMasters/starPlayersMasters as no positions', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });
    writeFileSync(
      join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'),
      roster({ rosterMaster: { name: 'Dwarf' } }),
    );

    config.getDataDir.mockReturnValue(dataDir);

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race?.positions).toEqual([]);
  });

  it('rethrows a listing failure that is not a missing directory', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(dataDir, { recursive: true });
    const notADir = join(dataDir, 'not-a-dir');
    writeFileSync(notADir, '');

    config.getDataDir.mockReturnValue(notADir);

    await expect(service.raceFor('Dwarf_BB2025')).rejects.toThrow();
  });

  it('returns null for a missing data directory instead of throwing', async () => {
    config.getDataDir.mockReturnValue(join(tempDir, 'nonexistent'));

    const race = await service.raceFor('Dwarf_BB2025');

    expect(race).toBeNull();
  });

  it('caches the index across multiple raceFor calls', async () => {
    const dataDir = join(tempDir, 'data');
    mkdirSync(join(dataDir, 'era-1', 'comp-a'), { recursive: true });
    writeFileSync(join(dataDir, 'era-1', 'comp-a', 'rosters_1.json'), roster());

    config.getDataDir.mockReturnValue(dataDir);

    const race1 = await service.raceFor('Dwarf_BB2025');
    expect(race1).toMatchObject({ rosterCount: 1 });

    // Delete the entire temp directory to verify caching
    rmSync(dataDir, { recursive: true });

    const race2 = await service.raceFor('Dwarf_BB2025');

    expect(race2).toEqual(race1);
  });
});

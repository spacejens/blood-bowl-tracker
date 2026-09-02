import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { ManualRawDataService } from './manual-raw-data.service';

describe('ManualRawDataService', () => {
  let service: ManualRawDataService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'manual-data-'));
    mkdirSync(join(tempDir, 'before-other-importers'), { recursive: true });
    mkdirSync(join(tempDir, 'after-other-importers'), { recursive: true });

    const mockConfig = {
      getDataDir: (type: string) => (type === 'manual' ? tempDir : ''),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualRawDataService,
        { provide: RaceReviewConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = moduleRef.get(ManualRawDataService);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('races() returns data from races-and-positions.json5', async () => {
    const json5Content = `
{
  races: [
    {
      name: 'Dwarf',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '5' }
      ]
    }
  ],
  positions: []
}
`;
    writeFileSync(
      join(tempDir, 'before-other-importers', 'races-and-positions.json5'),
      json5Content,
    );

    const races = await service.races();
    expect(races).toHaveLength(1);
    expect(races[0]).toEqual({
      name: 'Dwarf',
      externalIds: [{ system: 'tloeg.bbleague.se', id: '5' }],
    });
  });

  it('positions() returns name, isStarPlayer, and externalIds', async () => {
    const json5Content = `
{
  races: [],
  positions: [
    {
      name: 'Dwarf Blocker Lineman',
      isStarPlayer: false,
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '57-5' },
        { system: 'tourplay.net', id: '280' }
      ]
    }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'before-other-importers', 'races-and-positions.json5'),
      json5Content,
    );

    const positions = await service.positions();
    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({
      name: 'Dwarf Blocker Lineman',
      isStarPlayer: false,
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '57-5' },
        { system: 'tourplay.net', id: '280' },
      ],
    });
  });

  it('availability() returns name, externalIds, and raceEras', async () => {
    const json5Content = `
{
  positions: [
    {
      name: 'Dark Elf Lineman',
      isStarPlayer: false,
      externalIds: [{ system: 'Name', id: 'Dark Elf Team: Dark Elf Lineman' }],
      raceEras: [
        {
          race: { system: 'tloeg.bbleague.se', id: '4' },
          era: { system: 'Name', id: 'First era' }
        }
      ]
    }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-availability.json5'),
      json5Content,
    );

    const availability = await service.availability();
    expect(availability).toHaveLength(1);
    expect(availability[0]).toEqual({
      name: 'Dark Elf Lineman',
      externalIds: [{ system: 'Name', id: 'Dark Elf Team: Dark Elf Lineman' }],
      raceEras: [
        {
          race: { system: 'tloeg.bbleague.se', id: '4' },
          era: { system: 'Name', id: 'First era' },
        },
      ],
    });
  });

  it('characteristics() maps CRP entry without passing to passing: null', async () => {
    const json5Content = `
{
  positionRulesSets: [
    {
      position: { system: 'Name', id: 'Dwarf Team: Dwarf Blocker Linemen' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 4,
      strength: 3,
      agility: 2,
      armour: 9
    }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-characteristics.json5'),
      json5Content,
    );

    const characteristics = await service.characteristics();
    expect(characteristics).toHaveLength(1);
    expect(characteristics[0]).toEqual({
      position: { system: 'Name', id: 'Dwarf Team: Dwarf Blocker Linemen' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 4,
      strength: 3,
      agility: 2,
      passing: null,
      armour: 9,
    });
  });

  it('characteristics() keeps explicit passing value for BB2020 entry', async () => {
    const json5Content = `
{
  positionRulesSets: [
    {
      position: { system: 'Name', id: 'Some Position' },
      rulesSet: { system: 'Name', id: 'BB2020' },
      move: 6,
      strength: 3,
      agility: 3,
      passing: 2,
      armour: 7
    }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-characteristics.json5'),
      json5Content,
    );

    const characteristics = await service.characteristics();
    expect(characteristics).toHaveLength(1);
    expect(characteristics[0].passing).toEqual(2);
  });

  it('returns [] when a file is missing', async () => {
    // Don't create the file
    const races = await service.races();
    expect(races).toEqual([]);
  });

  it('returns [] when JSON5 is syntactically invalid', async () => {
    const malformedJson5 = `{ this is not valid json5 ]`;
    writeFileSync(
      join(tempDir, 'before-other-importers', 'races-and-positions.json5'),
      malformedJson5,
    );

    const races = await service.races();
    expect(races).toEqual([]);
  });

  it('caches file reads and returns cached result on second call', async () => {
    const json5Content = `
{
  races: [
    { name: 'Dwarf', externalIds: [{ system: 'tloeg.bbleague.se', id: '5' }] }
  ],
  positions: []
}
`;
    writeFileSync(
      join(tempDir, 'before-other-importers', 'races-and-positions.json5'),
      json5Content,
    );

    // First call
    const races1 = await service.races();
    expect(races1).toHaveLength(1);

    // Delete the file
    const filePath = join(
      tempDir,
      'before-other-importers',
      'races-and-positions.json5',
    );
    await rm(filePath);

    // Second call should still return cached result
    const races2 = await service.races();
    expect(races2).toEqual(races1);
  });

  it('skips entries that are not objects', async () => {
    const json5Content = `
{
  races: [
    { name: 'Dwarf', externalIds: [] },
    "not an object",
    123,
    null
  ],
  positions: []
}
`;
    writeFileSync(
      join(tempDir, 'before-other-importers', 'races-and-positions.json5'),
      json5Content,
    );

    const races = await service.races();
    expect(races).toHaveLength(1);
    expect(races[0].name).toEqual('Dwarf');
  });

  it('skips entries whose name is not a string', async () => {
    const json5Content = `
{
  races: [
    { name: 'Dwarf', externalIds: [] },
    { name: 123, externalIds: [] },
    { name: null, externalIds: [] },
    { externalIds: [] }
  ],
  positions: []
}
`;
    writeFileSync(
      join(tempDir, 'before-other-importers', 'races-and-positions.json5'),
      json5Content,
    );

    const races = await service.races();
    expect(races).toHaveLength(1);
    expect(races[0].name).toEqual('Dwarf');
  });
});

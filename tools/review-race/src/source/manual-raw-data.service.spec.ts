import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { ManualRawDataService } from './manual-raw-data.service';

describe('ManualRawDataService', () => {
  let service: ManualRawDataService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'manual-data-'));
    mkdirSync(join(tempDir, 'before-other-importers'), { recursive: true });
    mkdirSync(join(tempDir, 'after-other-importers'), { recursive: true });

    const config = mock<RaceReviewConfigService>();
    config.getDataDir.mockReturnValue(tempDir);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualRawDataService,
        { provide: RaceReviewConfigService, useValue: config },
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

  it('characteristics() pools the after-phase file and the before-phase gap-fill file', async () => {
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-characteristics.json5'),
      `
{
  positionRulesSets: [
    {
      position: { system: 'Name', id: 'Dwarf Team: Dwarf Blocker Linemen' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 4, strength: 3, agility: 2, armour: 9
    }
  ]
}
`,
    );
    writeFileSync(
      join(
        tempDir,
        'before-other-importers',
        'position-characteristics-gap-fill.json5',
      ),
      `
{
  positionRulesSets: [
    {
      position: { system: 'Name', id: 'Giant Mercenary' },
      rulesSet: { system: 'Name', id: 'BB2020' },
      move: 6, strength: 7, agility: 5, passing: 5, armour: 11
    }
  ]
}
`,
    );

    const characteristics = await service.characteristics();

    expect(characteristics).toHaveLength(2);
    expect(characteristics).toContainEqual({
      position: { system: 'Name', id: 'Dwarf Team: Dwarf Blocker Linemen' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 4,
      strength: 3,
      agility: 2,
      passing: null,
      armour: 9,
    });
    expect(characteristics).toContainEqual({
      position: { system: 'Name', id: 'Giant Mercenary' },
      rulesSet: { system: 'Name', id: 'BB2020' },
      move: 6,
      strength: 7,
      agility: 5,
      passing: 5,
      armour: 11,
    });
  });

  it('characteristics() returns the after-phase entries when the gap-fill file is missing', async () => {
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-characteristics.json5'),
      `
{
  positionRulesSets: [
    {
      position: { system: 'Name', id: 'Some Position' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 4, strength: 3, agility: 2, armour: 9
    }
  ]
}
`,
    );

    const characteristics = await service.characteristics();

    expect(characteristics).toHaveLength(1);
  });

  it('availability() skips an entry whose name is not a string', async () => {
    const json5Content = `
{
  positions: [
    { name: 'Dark Elf Lineman', externalIds: [], raceEras: [] },
    { name: null, externalIds: [], raceEras: [] }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-availability.json5'),
      json5Content,
    );

    const availability = await service.availability();
    expect(availability).toHaveLength(1);
    expect(availability[0].name).toEqual('Dark Elf Lineman');
  });

  it('availability() skips a raceEras entry whose race or era ref is invalid', async () => {
    const json5Content = `
{
  positions: [
    {
      name: 'Dark Elf Lineman',
      externalIds: [],
      raceEras: [
        { race: { system: 'tloeg.bbleague.se', id: '4' }, era: { system: 'Name', id: 'First era' } },
        { race: { id: '4' }, era: { system: 'Name', id: 'First era' } },
        { race: { system: 'tloeg.bbleague.se', id: '4' }, era: { system: 'Name' } }
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
    expect(availability[0].raceEras).toHaveLength(1);
  });

  it('characteristics() skips an entry with a missing position or rulesSet ref', async () => {
    const json5Content = `
{
  positionRulesSets: [
    {
      position: { system: 'Name', id: 'Dwarf Blocker Lineman' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 4, strength: 3, agility: 2, armour: 9
    },
    {
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 4, strength: 3, agility: 2, armour: 9
    },
    {
      position: { system: 'Name', id: 'Dwarf Blocker Lineman' },
      move: 4, strength: 3, agility: 2, armour: 9
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
  });

  it('races() skips an externalIds entry with a missing system or non-string/number id', async () => {
    const json5Content = `
{
  races: [
    {
      name: 'Dwarf',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '5' },
        { id: '6' },
        { system: 'tloeg.bbleague.se', id: null },
        { system: 'tloeg.bbleague.se', id: true }
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
    expect(races[0].externalIds).toEqual([
      { system: 'tloeg.bbleague.se', id: '5' },
    ]);
  });

  it('returns {} when the parsed JSON5 is not an object (e.g. a bare number)', async () => {
    writeFileSync(
      join(tempDir, 'before-other-importers', 'races-and-positions.json5'),
      '42',
    );

    const races = await service.races();
    expect(races).toEqual([]);
  });

  it('treats a non-array externalIds as no external ids', async () => {
    const json5Content = `
{
  races: [
    { name: 'Dwarf', externalIds: 'not-an-array' }
  ],
  positions: []
}
`;
    writeFileSync(
      join(tempDir, 'before-other-importers', 'races-and-positions.json5'),
      json5Content,
    );

    const races = await service.races();
    expect(races[0].externalIds).toEqual([]);
  });

  it('treats a non-array raceEras as no race eras', async () => {
    const json5Content = `
{
  positions: [
    { name: 'Dark Elf Lineman', externalIds: [], raceEras: 'not-an-array' }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-availability.json5'),
      json5Content,
    );

    const availability = await service.availability();
    expect(availability[0].raceEras).toEqual([]);
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

  it('reads curated position starting skills', async () => {
    const json5Content = `
{
  positionRulesSetSkills: [
    {
      position: { system: 'Name', id: 'Dwarf: Dwarf Blitzer' },
      rulesSet: { system: 'Name', id: 'CRP' },
      skills: [
        { system: 'Name', id: 'Block' },
        { system: 'Name', id: 'Thick Skull' }
      ]
    }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-skills.json5'),
      json5Content,
    );

    expect(await service.positionSkills()).toEqual([
      {
        position: { system: 'Name', id: 'Dwarf: Dwarf Blitzer' },
        rulesSet: { system: 'Name', id: 'CRP' },
        skills: [
          { skill: { system: 'Name', id: 'Block' }, attributeValue: null },
          {
            skill: { system: 'Name', id: 'Thick Skull' },
            attributeValue: null,
          },
        ],
      },
    ]);
  });

  it('reads a curated skill wrapped with an attribute value', async () => {
    const json5Content = `
{
  positionRulesSetSkills: [
    {
      position: { system: 'Name', id: 'SL - Chaos Halflings: SL - Carvers' },
      rulesSet: { system: 'Name', id: 'CRP' },
      skills: [
        { system: 'Name', id: 'Dodge' },
        { skill: { system: 'Name', id: 'Secret Weapon' }, attributeValue: '7+' }
      ]
    }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-skills.json5'),
      json5Content,
    );

    expect(await service.positionSkills()).toEqual([
      {
        position: {
          system: 'Name',
          id: 'SL - Chaos Halflings: SL - Carvers',
        },
        rulesSet: { system: 'Name', id: 'CRP' },
        skills: [
          { skill: { system: 'Name', id: 'Dodge' }, attributeValue: null },
          {
            skill: { system: 'Name', id: 'Secret Weapon' },
            attributeValue: '7+',
          },
        ],
      },
    ]);
  });

  it('drops a wrapped curated skill whose inner ref is invalid', async () => {
    const json5Content = `
{
  positionRulesSetSkills: [
    {
      position: { system: 'Name', id: 'Some Position' },
      rulesSet: { system: 'Name', id: 'CRP' },
      skills: [
        { skill: { id: 'Secret Weapon' }, attributeValue: '7+' }
      ]
    }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-skills.json5'),
      json5Content,
    );

    expect(await service.positionSkills()).toEqual([
      {
        position: { system: 'Name', id: 'Some Position' },
        rulesSet: { system: 'Name', id: 'CRP' },
        skills: [],
      },
    ]);
  });

  it('drops a curated skills entry with no position or rules set ref', async () => {
    const json5Content = `
{
  positionRulesSetSkills: [
    { rulesSet: { system: 'Name', id: 'CRP' }, skills: [] }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'after-other-importers', 'position-skills.json5'),
      json5Content,
    );

    expect(await service.positionSkills()).toEqual([]);
  });

  it('returns no curated skills when the file is missing', async () => {
    expect(await service.positionSkills()).toEqual([]);
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

  it('reads a curated keyword entry with a tourplay.net code', async () => {
    const json5Content = `
{
  keywords: [
    {
      name: 'Goblin',
      kind: 'species',
      externalIds: [
        { system: 'Name', id: 'Goblin' },
        { system: 'tourplay.net', id: '111' }
      ]
    }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'before-other-importers', 'keywords.json5'),
      json5Content,
    );

    expect(await service.keywords()).toEqual([
      { name: 'Goblin', kind: 'species', code: '111' },
    ]);
  });

  it('reads a curated keyword entry with no tourplay.net code as code: null', async () => {
    const json5Content = `
{
  keywords: [
    {
      name: 'Big Guy',
      kind: 'positional',
      externalIds: [{ system: 'Name', id: 'Big Guy' }]
    }
  ]
}
`;
    writeFileSync(
      join(tempDir, 'before-other-importers', 'keywords.json5'),
      json5Content,
    );

    expect(await service.keywords()).toEqual([
      { name: 'Big Guy', kind: 'positional', code: null },
    ]);
  });
});

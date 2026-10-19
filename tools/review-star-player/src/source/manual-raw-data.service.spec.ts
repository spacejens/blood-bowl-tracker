import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import { ManualRawDataService } from './manual-raw-data.service';

let dir: string;

function write(relativePath: string, contents: string): void {
  const path = join(dir, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, contents, 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-star-player-manual-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ManualRawDataService', () => {
  let service: ManualRawDataService;

  beforeEach(async () => {
    const config = mock<StarPlayerReviewConfigService>();
    config.getDataDir.mockReturnValue(dir);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualRawDataService,
        { provide: StarPlayerReviewConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(ManualRawDataService);
  });

  it('returns only the star player entries of star-players.json5', async () => {
    write(
      'batches/001-a/star-players.json5',
      `{ positions: [
        { name: 'Griff Oberwald', isStarPlayer: true,
          externalIds: [{ system: 'Name', id: 'Griff Oberwald' }] },
        { name: 'Dwarf Blitzer', isStarPlayer: false, externalIds: [] },
      ] }`,
    );

    expect(await service.starPlayers()).toEqual([
      {
        name: 'Griff Oberwald',
        externalIds: [{ system: 'Name', id: 'Griff Oberwald' }],
      },
    ]);
  });

  it('stringifies a numeric external id', async () => {
    write(
      'batches/001-a/star-players.json5',
      "{ positions: [{ name: 'X', isStarPlayer: true, externalIds: [{ system: 'tourplay.net', id: 42 }] }] }",
    );

    expect((await service.starPlayers())[0]?.externalIds).toEqual([
      { system: 'tourplay.net', id: '42' },
    ]);
  });

  it("returns position-availability.json5's raceEras pairs", async () => {
    write(
      'batches/002-b/position-availability.json5',
      `{ positions: [{ name: 'Griff Oberwald', externalIds: [],
        raceEras: [{ race: { system: 'Name', id: 'Human' },
                     era: { system: 'Name', id: 'BB2020 era' } }] }] }`,
    );

    expect(await service.availability()).toEqual([
      {
        name: 'Griff Oberwald',
        externalIds: [],
        raceEras: [
          {
            race: { system: 'Name', id: 'Human' },
            era: { system: 'Name', id: 'BB2020 era' },
          },
        ],
      },
    ]);
  });

  it('pools characteristics from the batch 002 and gap-fill files', async () => {
    write(
      'batches/002-b/position-characteristics.json5',
      `{ positionRulesSets: [{ position: { system: 'Name', id: 'Griff Oberwald' },
        rulesSet: { system: 'Name', id: 'BB2020' },
        move: 7, strength: 4, agility: 2, passing: 3, armour: 9 }] }`,
    );
    write(
      'batches/001-a/position-characteristics-gap-fill.json5',
      `{ positionRulesSets: [{ position: { system: 'Name', id: 'Griff Oberwald' },
        rulesSet: { system: 'Name', id: 'CRP' },
        move: 7, strength: 4, agility: 3, armour: 9 }] }`,
    );

    const entries = await service.characteristics();

    expect(entries.map((entry) => entry.rulesSet.id)).toEqual([
      'CRP',
      'BB2020',
    ]);
    expect(entries[0]?.passing).toBeNull();
  });

  it('degrades a missing file to an empty list', async () => {
    expect(await service.starPlayers()).toEqual([]);
    expect(await service.availability()).toEqual([]);
    expect(await service.characteristics()).toEqual([]);
  });

  it('degrades a malformed file to an empty list', async () => {
    write('batches/001-a/star-players.json5', '{ positions: [');

    expect(await service.starPlayers()).toEqual([]);
  });

  it('reads each file only once', async () => {
    write(
      'batches/001-a/star-players.json5',
      "{ positions: [{ name: 'X', isStarPlayer: true, externalIds: [] }] }",
    );

    await service.starPlayers();
    rmSync(join(dir, 'batches/001-a'), {
      recursive: true,
      force: true,
    });

    expect(await service.starPlayers()).toHaveLength(1);
  });

  it('drops a characteristics entry with no position or rules-set reference', async () => {
    write(
      'batches/002-b/position-characteristics.json5',
      '{ positionRulesSets: [{ move: 1 }] }',
    );

    expect(await service.characteristics()).toEqual([]);
  });

  it('reads a curated keyword entry with a tourplay.net code', async () => {
    write(
      'batches/001-a/keywords.json5',
      `{ keywords: [
        { name: 'Goblin', kind: 'species',
          externalIds: [
            { system: 'Name', id: 'Goblin' },
            { system: 'tourplay.net', id: '111' },
          ] },
      ] }`,
    );

    expect(await service.keywords()).toEqual([
      { name: 'Goblin', kind: 'species', code: '111' },
    ]);
  });

  it('reads a curated keyword entry with no tourplay.net code as code: null', async () => {
    write(
      'batches/001-a/keywords.json5',
      `{ keywords: [
        { name: 'Big Guy', kind: 'positional',
          externalIds: [{ system: 'Name', id: 'Big Guy' }] },
      ] }`,
    );

    expect(await service.keywords()).toEqual([
      { name: 'Big Guy', kind: 'positional', code: null },
    ]);
  });

  it('degrades a missing keywords file to an empty list', async () => {
    expect(await service.keywords()).toEqual([]);
  });

  it('pools star entries across batches, later batches winning on the same ids', async () => {
    write(
      'batches/001-a/star-players.json5',
      `{ positions: [
        { name: 'Griff', isStarPlayer: true, externalIds: [{ system: 'Name', id: 'Griff' }] },
        { name: 'Morg', isStarPlayer: true, externalIds: [{ system: 'Name', id: 'Morg' }] },
      ] }`,
    );
    write(
      'batches/003-c/positions.json5',
      `{ positions: [
        { name: 'Griff Oberwald', isStarPlayer: true, externalIds: [{ system: 'Name', id: 'Griff' }] },
        { name: 'Morg the restated', externalIds: [{ system: 'Name', id: 'Morg' }] },
      ] }`,
    );

    expect((await service.starPlayers()).map((star) => star.name)).toEqual([
      'Griff Oberwald',
      'Morg',
    ]);
  });
});

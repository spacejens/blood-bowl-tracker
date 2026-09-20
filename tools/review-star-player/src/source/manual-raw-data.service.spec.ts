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

async function makeService(): Promise<ManualRawDataService> {
  const config = mock<StarPlayerReviewConfigService>();
  config.getDataDir.mockReturnValue(dir);
  const moduleRef = await Test.createTestingModule({
    providers: [
      ManualRawDataService,
      { provide: StarPlayerReviewConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(ManualRawDataService);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-star-player-manual-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ManualRawDataService', () => {
  it('returns only the star player entries of star-players.json5', async () => {
    write(
      'before-other-importers/star-players.json5',
      `{ positions: [
        { name: 'Griff Oberwald', isStarPlayer: true,
          externalIds: [{ system: 'Name', id: 'Griff Oberwald' }] },
        { name: 'Dwarf Blitzer', isStarPlayer: false, externalIds: [] },
      ] }`,
    );
    const service = await makeService();

    expect(await service.starPlayers()).toEqual([
      {
        name: 'Griff Oberwald',
        externalIds: [{ system: 'Name', id: 'Griff Oberwald' }],
      },
    ]);
  });

  it('stringifies a numeric external id', async () => {
    write(
      'before-other-importers/star-players.json5',
      "{ positions: [{ name: 'X', isStarPlayer: true, externalIds: [{ system: 'tourplay.net', id: 42 }] }] }",
    );
    const service = await makeService();

    expect((await service.starPlayers())[0]?.externalIds).toEqual([
      { system: 'tourplay.net', id: '42' },
    ]);
  });

  it("returns position-availability.json5's raceEras pairs", async () => {
    write(
      'after-other-importers/position-availability.json5',
      `{ positions: [{ name: 'Griff Oberwald', externalIds: [],
        raceEras: [{ race: { system: 'Name', id: 'Human' },
                     era: { system: 'Name', id: 'BB2020 era' } }] }] }`,
    );
    const service = await makeService();

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

  it('pools characteristics from the after-phase and gap-fill files', async () => {
    write(
      'after-other-importers/position-characteristics.json5',
      `{ positionRulesSets: [{ position: { system: 'Name', id: 'Griff Oberwald' },
        rulesSet: { system: 'Name', id: 'BB2020' },
        move: 7, strength: 4, agility: 2, passing: 3, armour: 9 }] }`,
    );
    write(
      'before-other-importers/position-characteristics-gap-fill.json5',
      `{ positionRulesSets: [{ position: { system: 'Name', id: 'Griff Oberwald' },
        rulesSet: { system: 'Name', id: 'CRP' },
        move: 7, strength: 4, agility: 3, armour: 9 }] }`,
    );
    const service = await makeService();

    const entries = await service.characteristics();

    expect(entries.map((entry) => entry.rulesSet.id)).toEqual([
      'BB2020',
      'CRP',
    ]);
    expect(entries[1]?.passing).toBeNull();
  });

  it('degrades a missing file to an empty list', async () => {
    const service = await makeService();

    expect(await service.starPlayers()).toEqual([]);
    expect(await service.availability()).toEqual([]);
    expect(await service.characteristics()).toEqual([]);
  });

  it('degrades a malformed file to an empty list', async () => {
    write('before-other-importers/star-players.json5', '{ positions: [');
    const service = await makeService();

    expect(await service.starPlayers()).toEqual([]);
  });

  it('reads each file only once', async () => {
    write(
      'before-other-importers/star-players.json5',
      "{ positions: [{ name: 'X', isStarPlayer: true, externalIds: [] }] }",
    );
    const service = await makeService();

    await service.starPlayers();
    rmSync(join(dir, 'before-other-importers'), {
      recursive: true,
      force: true,
    });

    expect(await service.starPlayers()).toHaveLength(1);
  });

  it('drops a characteristics entry with no position or rules-set reference', async () => {
    write(
      'after-other-importers/position-characteristics.json5',
      '{ positionRulesSets: [{ move: 1 }] }',
    );
    const service = await makeService();

    expect(await service.characteristics()).toEqual([]);
  });

  it('reads a curated keyword entry with a tourplay.net code', async () => {
    write(
      'before-other-importers/keywords.json5',
      `{ keywords: [
        { name: 'Goblin', kind: 'species',
          externalIds: [
            { system: 'Name', id: 'Goblin' },
            { system: 'tourplay.net', id: '111' },
          ] },
      ] }`,
    );
    const service = await makeService();

    expect(await service.keywords()).toEqual([
      { name: 'Goblin', kind: 'species', code: '111' },
    ]);
  });

  it('reads a curated keyword entry with no tourplay.net code as code: null', async () => {
    write(
      'before-other-importers/keywords.json5',
      `{ keywords: [
        { name: 'Big Guy', kind: 'positional',
          externalIds: [{ system: 'Name', id: 'Big Guy' }] },
      ] }`,
    );
    const service = await makeService();

    expect(await service.keywords()).toEqual([
      { name: 'Big Guy', kind: 'positional', code: null },
    ]);
  });

  it('degrades a missing keywords file to an empty list', async () => {
    const service = await makeService();

    expect(await service.keywords()).toEqual([]);
  });
});

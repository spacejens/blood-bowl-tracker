import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import { SourceConfigService } from './source-config.service';
import type { TpSourceFile } from './tp-source-reader';
import { TpSourceReader } from './tp-source-reader';

async function makeReader(
  dir: string,
  eras: EraDataConfig[],
): Promise<TpSourceReader> {
  const sourceConfig = mock<SourceConfigService>();
  sourceConfig.getDataDir.mockReturnValue(dir);
  const eraConfig = mock<EraDataConfigService>();
  eraConfig.getEras.mockReturnValue(eras);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpSourceReader,
      { provide: SourceConfigService, useValue: sourceConfig },
      { provide: EraDataConfigService, useValue: eraConfig },
    ],
  }).compile();
  return moduleRef.get(TpSourceReader);
}

async function collect(
  iterable: AsyncIterable<TpSourceFile>,
): Promise<TpSourceFile[]> {
  const files: TpSourceFile[] = [];
  for await (const file of iterable) {
    files.push(file);
  }
  return files;
}

describe('TpSourceReader', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tp-reader-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('yields one entry per JSON file across nested era/competition dirs', async () => {
    const compDir = join(dir, 'fourth-era', 'chaos-cup-8');
    await mkdir(compDir, { recursive: true });
    await writeFile(join(compDir, 'match_566088.json'), '{"id":566088}');
    await writeFile(join(compDir, 'rosters_163386.json'), '{"id":163386}');

    const reader = await makeReader(dir, [
      {
        name: 'Fourth era',
        dataSubdir: 'fourth-era',
        rulesSets: ['BB2020'],
        startDate: '2020-11-28',
      },
    ]);
    const files = await collect(reader.files());

    expect(files).toHaveLength(2);
    const byName = new Map(files.map((f) => [f.filename, f]));
    expect(byName.get('match_566088.json')).toEqual({
      era: 'Fourth era',
      competition: 'chaos-cup-8',
      type: 'match',
      filename: 'match_566088.json',
      content: { id: 566088 },
    });
    expect(byName.get('rosters_163386.json')?.type).toBe('rosters');
  });

  it('uses the configured era name, not the dataSubdir, as the era field', async () => {
    const compDir = join(dir, 'fourth-era', 'chaos-cup-8');
    await mkdir(compDir, { recursive: true });
    await writeFile(join(compDir, 'match_1.json'), '{}');

    const reader = await makeReader(dir, [
      {
        name: 'Fourth era',
        dataSubdir: 'fourth-era',
        rulesSets: ['BB2020'],
        startDate: '2020-11-28',
      },
    ]);
    const [file] = await collect(reader.files());

    expect(file.era).toBe('Fourth era');
  });

  it('extracts type from the whole filename when there is no underscore', async () => {
    const compDir = join(dir, 'fourth-era', 'chaos-cup-8');
    await mkdir(compDir, { recursive: true });
    await writeFile(join(compDir, 'standings.json'), '{}');

    const reader = await makeReader(dir, [
      {
        name: 'Fourth era',
        dataSubdir: 'fourth-era',
        rulesSets: ['BB2020'],
        startDate: '2020-11-28',
      },
    ]);
    const [file] = await collect(reader.files());

    expect(file.type).toBe('standings');
  });

  it('skips non-JSON files in a competition directory', async () => {
    const compDir = join(dir, 'fourth-era', 'chaos-cup-8');
    await mkdir(compDir, { recursive: true });
    await writeFile(join(compDir, 'match_1.json'), '{}');
    await writeFile(join(compDir, 'notes.txt'), 'ignore me');

    const reader = await makeReader(dir, [
      {
        name: 'Fourth era',
        dataSubdir: 'fourth-era',
        rulesSets: ['BB2020'],
        startDate: '2020-11-28',
      },
    ]);
    const files = await collect(reader.files());

    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('match_1.json');
  });

  it('skips non-directory entries directly under an era directory', async () => {
    const eraDir = join(dir, 'fourth-era');
    await mkdir(eraDir, { recursive: true });
    await writeFile(join(eraDir, 'loose_file.json'), '{}');
    const compDir = join(eraDir, 'chaos-cup-8');
    await mkdir(compDir, { recursive: true });
    await writeFile(join(compDir, 'match_1.json'), '{}');

    const reader = await makeReader(dir, [
      {
        name: 'Fourth era',
        dataSubdir: 'fourth-era',
        rulesSets: ['BB2020'],
        startDate: '2020-11-28',
      },
    ]);
    const files = await collect(reader.files());

    expect(files).toHaveLength(1);
    expect(files[0].competition).toBe('chaos-cup-8');
  });

  it('throws a friendly error when an era directory is missing', async () => {
    const reader = await makeReader(dir, [
      {
        name: 'Fourth era',
        dataSubdir: 'fourth-era',
        rulesSets: ['BB2020'],
        startDate: '2020-11-28',
      },
    ]);
    await expect(collect(reader.files())).rejects.toThrow(
      /Era data directory not found.*Fourth era/,
    );
  });
});

describe('isBaseTournamentFile', () => {
  let reader: TpSourceReader;

  beforeEach(async () => {
    reader = await makeReader('/unused', []);
  });

  it('accepts a base tournament file with a hyphenated slug', () => {
    expect(reader.isBaseTournamentFile('tournament_chaos-cup-8.json')).toBe(
      true,
    );
  });

  it('rejects a tournament variant file carrying a second underscore', () => {
    expect(
      reader.isBaseTournamentFile('tournament_chaos-cup-8_coach-stats.json'),
    ).toBe(false);
    expect(reader.isBaseTournamentFile('tournament_a_team-stats.json')).toBe(
      false,
    );
  });

  it('rejects non-tournament filenames', () => {
    expect(reader.isBaseTournamentFile('match_566088.json')).toBe(false);
    expect(reader.isBaseTournamentFile('rosters_1.json')).toBe(false);
  });
});

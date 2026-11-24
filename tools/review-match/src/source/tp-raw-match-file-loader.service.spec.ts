import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ReviewMatchConfigService } from '../config/review-match-config.service';
import { TpRawMatchFileLoaderService } from './tp-raw-match-file-loader.service';

describe('TpRawMatchFileLoaderService', () => {
  let dir: string;
  let config: MockProxy<ReviewMatchConfigService>;
  let service: TpRawMatchFileLoaderService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tp-raw-loader-'));
    config = mock<ReviewMatchConfigService>();
    config.getDataDir.mockReturnValue(dir);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRawMatchFileLoaderService,
        { provide: ReviewMatchConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(TpRawMatchFileLoaderService);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeMatch(
    relativeDir: string,
    filename: string,
    contents: string,
  ): Promise<void> {
    const target = join(dir, relativeDir);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, filename), contents, 'utf8');
  }

  it('finds a match file two directory levels down and parses it', async () => {
    await writeMatch(
      join('third-era', 'season-26'),
      'match_344820.json',
      '{ "matchId": 344820 }',
    );
    await expect(service.loadMatchFile('344820')).resolves.toEqual({
      matchId: 344820,
    });
  });

  it('ignores files that are not match files', async () => {
    await writeMatch(
      join('third-era', 'season-26'),
      'rosters_46578.json',
      '{ "id": 46578 }',
    );
    await expect(service.loadMatchFile('46578')).resolves.toBeNull();
  });

  it('returns null when no file exists for the id', async () => {
    await writeMatch(
      join('third-era', 'season-26'),
      'match_1.json',
      '{ "matchId": 1 }',
    );
    await expect(service.loadMatchFile('2')).resolves.toBeNull();
  });

  it('returns null when the data directory does not exist', async () => {
    config.getDataDir.mockReturnValue(join(dir, 'nope'));

    await expect(service.loadMatchFile('1')).resolves.toBeNull();
  });

  it('throws a descriptive error when the match file is not valid JSON', async () => {
    await writeMatch(join('era', 'comp'), 'match_5.json', 'not json');
    await expect(service.loadMatchFile('5')).rejects.toThrow(
      /Failed to parse TP match file .*match_5\.json/,
    );
  });

  it('rethrows a non-ENOENT filesystem error instead of treating it as missing', async () => {
    // A regular file in place of the data directory makes readdir fail with
    // ENOTDIR, not ENOENT — that error must propagate.
    const notADirectory = join(dir, 'data-dir-is-actually-a-file');
    await writeFile(notADirectory, 'not a directory', 'utf8');
    config.getDataDir.mockReturnValue(notADirectory);

    await expect(service.loadMatchFile('1')).rejects.toThrow(/ENOTDIR/);
  });

  it('scans the directory tree only once across calls', async () => {
    await writeMatch(join('era', 'comp'), 'match_5.json', '{ "matchId": 5 }');
    await service.loadMatchFile('5');
    // A file added after the first call is invisible to later calls, which is
    // only true if the filename index was built once and reused.
    await writeMatch(join('era', 'comp'), 'match_6.json', '{ "matchId": 6 }');

    await expect(service.loadMatchFile('6')).resolves.toBeNull();
  });
});

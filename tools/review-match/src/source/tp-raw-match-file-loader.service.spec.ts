import {
  TpFileNameService,
  TpFilesReaderService,
} from '@blood-bowl-tracker/read-tp-files';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ReviewMatchConfigService } from '../config/review-match-config.service';
import { TpRawMatchFileLoaderService } from './tp-raw-match-file-loader.service';

describe('TpRawMatchFileLoaderService', () => {
  const dataDir = '/data/tp';
  let config: MockProxy<ReviewMatchConfigService>;
  let tpFiles: MockProxy<TpFilesReaderService>;
  let service: TpRawMatchFileLoaderService;

  beforeEach(async () => {
    config = mock<ReviewMatchConfigService>();
    config.getDataDir.mockReturnValue(dataDir);
    tpFiles = mock<TpFilesReaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRawMatchFileLoaderService,
        TpFileNameService,
        { provide: TpFilesReaderService, useValue: tpFiles },
        { provide: ReviewMatchConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(TpRawMatchFileLoaderService);
  });

  function stubLayout(filenames: string[]): void {
    tpFiles.listEras.mockResolvedValue(['third-era']);
    tpFiles.listCompetitions.mockResolvedValue(['season-26']);
    tpFiles.listFiles.mockResolvedValue(filenames);
  }

  it('finds a match file two directory levels down and parses it', async () => {
    stubLayout(['match_344820.json']);
    tpFiles.readJson.mockResolvedValue({
      path: '/data/tp/third-era/season-26/match_344820.json',
      content: { matchId: 344820 },
    });

    await expect(service.loadMatchFile('344820')).resolves.toEqual({
      matchId: 344820,
    });
    expect(tpFiles.readJson).toHaveBeenCalledWith(dataDir, [
      'third-era',
      'season-26',
      'match_344820.json',
    ]);
  });

  it('ignores files that are not match files', async () => {
    stubLayout(['rosters_46578.json']);

    await expect(service.loadMatchFile('46578')).resolves.toBeNull();
    expect(tpFiles.readJson).not.toHaveBeenCalled();
  });

  it('returns null when no file exists for the id', async () => {
    stubLayout(['match_1.json']);

    await expect(service.loadMatchFile('2')).resolves.toBeNull();
    expect(tpFiles.readJson).not.toHaveBeenCalled();
  });

  it('returns null when the data directory does not exist', async () => {
    tpFiles.listEras.mockResolvedValue([]);

    await expect(service.loadMatchFile('1')).resolves.toBeNull();
  });

  it('returns null when the located file has vanished before it is read', async () => {
    stubLayout(['match_1.json']);
    tpFiles.readJson.mockResolvedValue(null);

    await expect(service.loadMatchFile('1')).resolves.toBeNull();
  });

  it('throws a descriptive error when the match file is not valid JSON', async () => {
    stubLayout(['match_5.json']);
    tpFiles.readJson.mockRejectedValue(
      new Error('Failed to parse TP file /data/tp/era/comp/match_5.json: bad'),
    );

    await expect(service.loadMatchFile('5')).rejects.toThrow(
      /Failed to parse TP file .*match_5\.json/,
    );
  });

  it('rethrows a non-ENOENT filesystem error instead of treating it as missing', async () => {
    tpFiles.listEras.mockRejectedValue(
      Object.assign(new Error('ENOTDIR: not a directory'), {
        code: 'ENOTDIR',
      }),
    );

    await expect(service.loadMatchFile('1')).rejects.toThrow(/ENOTDIR/);
  });

  it('scans the directory tree only once across calls', async () => {
    stubLayout(['match_5.json']);
    tpFiles.readJson.mockResolvedValue({
      path: '/data/tp/third-era/season-26/match_5.json',
      content: { matchId: 5 },
    });
    await service.loadMatchFile('5');
    // A file appearing in a later listing is invisible to later calls, which is
    // only true if the filename index was built once and reused.
    stubLayout(['match_5.json', 'match_6.json']);

    await expect(service.loadMatchFile('6')).resolves.toBeNull();
    expect(tpFiles.listEras).toHaveBeenCalledTimes(1);
  });
});

import { BblMirrorReaderService as SharedBblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { BblMirrorReaderService } from './bbl-mirror-reader.service';

const DATA_DIR = '/bbl/data';

describe('BblMirrorReaderService', () => {
  let service: BblMirrorReaderService;
  let shared: MockProxy<SharedBblMirrorReaderService>;

  beforeEach(async () => {
    const config = mock<RaceReviewConfigService>();
    config.getDataDir.mockReturnValue(DATA_DIR);
    shared = mock<SharedBblMirrorReaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblMirrorReaderService,
        { provide: RaceReviewConfigService, useValue: config },
        { provide: SharedBblMirrorReaderService, useValue: shared },
      ],
    }).compile();
    service = moduleRef.get(BblMirrorReaderService);
  });

  describe('readPage', () => {
    it('reads the named file out of the BBL data directory', async () => {
      shared.readFile.mockResolvedValue('<h1>Race List</h1>');

      expect(await service.readPage('default.asp?p=tl')).toBe(
        '<h1>Race List</h1>',
      );
      expect(shared.readFile).toHaveBeenCalledWith(
        DATA_DIR,
        'default.asp?p=tl',
      );
    });

    it('returns null for a page that is not in the mirror', async () => {
      shared.readFile.mockResolvedValue(null);

      expect(await service.readPage('default.asp?p=tl')).toBeNull();
    });

    it('propagates a read failure instead of swallowing it', async () => {
      shared.readFile.mockRejectedValue(new Error('EISDIR'));

      await expect(service.readPage('default.asp?p=tl')).rejects.toThrow(
        /EISDIR/,
      );
    });
  });

  describe('listTeamPageFilenames', () => {
    it('returns team page filenames matching the pattern, sorted', async () => {
      shared.listFiles.mockResolvedValue([
        'default.asp?p=tm&t=DEF',
        'default.asp?p=tm&t=ABC',
        'default.asp?p=tl',
        'notes.txt',
      ]);

      expect(await service.listTeamPageFilenames()).toEqual([
        'default.asp?p=tm&t=ABC',
        'default.asp?p=tm&t=DEF',
      ]);
      expect(shared.listFiles).toHaveBeenCalledWith(DATA_DIR);
    });

    it('returns an empty array when the mirror directory has no files', async () => {
      shared.listFiles.mockResolvedValue([]);

      expect(await service.listTeamPageFilenames()).toEqual([]);
    });

    it('propagates a listing failure instead of swallowing it', async () => {
      shared.listFiles.mockRejectedValue(new Error('ENOTDIR'));

      await expect(service.listTeamPageFilenames()).rejects.toThrow(/ENOTDIR/);
    });
  });
});

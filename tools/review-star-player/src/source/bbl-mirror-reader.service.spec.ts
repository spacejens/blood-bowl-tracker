import { BblMirrorReaderService as SharedBblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import { BblMirrorReaderService } from './bbl-mirror-reader.service';

async function makeService(
  mirror: MockProxy<SharedBblMirrorReaderService>,
): Promise<BblMirrorReaderService> {
  const config = mock<StarPlayerReviewConfigService>();
  config.getDataDir.mockReturnValue('/mirror');
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMirrorReaderService,
      { provide: StarPlayerReviewConfigService, useValue: config },
      { provide: SharedBblMirrorReaderService, useValue: mirror },
    ],
  }).compile();
  return moduleRef.get(BblMirrorReaderService);
}

describe('BblMirrorReaderService', () => {
  it('reads a page from the configured data dir', async () => {
    const mirror = mock<SharedBblMirrorReaderService>();
    mirror.readFile.mockResolvedValue('<html></html>');
    const service = await makeService(mirror);

    expect(await service.readPage('default.asp?p=pt&typID=126')).toBe(
      '<html></html>',
    );
    expect(mirror.readFile).toHaveBeenCalledWith(
      '/mirror',
      'default.asp?p=pt&typID=126',
    );
  });

  it('returns null for a page that is not in the mirror', async () => {
    const mirror = mock<SharedBblMirrorReaderService>();
    mirror.readFile.mockResolvedValue(null);
    const service = await makeService(mirror);

    expect(await service.readPage('default.asp?p=pt&typID=1')).toBeNull();
  });

  it('lists only position pages, sorted', async () => {
    const mirror = mock<SharedBblMirrorReaderService>();
    mirror.listFiles.mockResolvedValue([
      'default.asp?p=tm&t=abc',
      'default.asp?p=pt&typID=9',
      'default.asp?p=pt&typID=126',
      'index.html',
    ]);
    const service = await makeService(mirror);

    expect(await service.listPositionPageFilenames()).toEqual([
      'default.asp?p=pt&typID=126',
      'default.asp?p=pt&typID=9',
    ]);
  });

  it('returns an empty list when the mirror directory is absent', async () => {
    const mirror = mock<SharedBblMirrorReaderService>();
    mirror.listFiles.mockResolvedValue([]);
    const service = await makeService(mirror);

    expect(await service.listPositionPageFilenames()).toEqual([]);
  });
});

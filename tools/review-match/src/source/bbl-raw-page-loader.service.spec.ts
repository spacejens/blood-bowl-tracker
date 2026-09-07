import { BblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ReviewMatchConfigService } from '../config/review-match-config.service';
import { BblRawPageLoaderService } from './bbl-raw-page-loader.service';

const DATA_DIR = '/bbl/data';

describe('BblRawPageLoaderService', () => {
  let service: BblRawPageLoaderService;
  let mirror: MockProxy<BblMirrorReaderService>;

  beforeEach(async () => {
    const config = mock<ReviewMatchConfigService>();
    config.getDataDir.mockReturnValue(DATA_DIR);
    mirror = mock<BblMirrorReaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblRawPageLoaderService,
        { provide: ReviewMatchConfigService, useValue: config },
        { provide: BblMirrorReaderService, useValue: mirror },
      ],
    }).compile();
    service = moduleRef.get(BblRawPageLoaderService);
  });

  it('reads the match page named after the external id, from the BBL data dir', async () => {
    mirror.readFile.mockResolvedValue('<html>ok</html>');

    await expect(service.loadMatchPage('1830')).resolves.toBe(
      '<html>ok</html>',
    );
    expect(mirror.readFile).toHaveBeenCalledWith(
      DATA_DIR,
      'default.asp?p=m&m=1830',
    );
  });

  it('returns null when the page is not in the mirror', async () => {
    mirror.readFile.mockResolvedValue(null);

    await expect(service.loadMatchPage('404')).resolves.toBeNull();
  });

  it('builds the filename verbatim, even for an id with path-escape characters', async () => {
    mirror.readFile.mockResolvedValue(null);

    await expect(service.loadMatchPage('../../etc/passwd')).resolves.toBeNull();
    expect(mirror.readFile).toHaveBeenCalledWith(
      DATA_DIR,
      'default.asp?p=m&m=../../etc/passwd',
    );
  });

  it('propagates a read failure instead of swallowing it', async () => {
    mirror.readFile.mockRejectedValue(new Error('EISDIR'));

    await expect(service.loadMatchPage('999')).rejects.toThrow(/EISDIR/);
  });
});

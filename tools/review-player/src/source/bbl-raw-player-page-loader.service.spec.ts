import { BblMirrorReaderService } from '@blood-bowl-tracker/read-bbl-mirror';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { BblRawPlayerPageLoaderService } from './bbl-raw-player-page-loader.service';

const DATA_DIR = '/bbl/data';

describe('BblRawPlayerPageLoaderService', () => {
  let service: BblRawPlayerPageLoaderService;
  let mirror: MockProxy<BblMirrorReaderService>;

  beforeEach(async () => {
    const config = mock<ReviewPlayerConfigService>();
    config.getDataDir.mockReturnValue(DATA_DIR);
    mirror = mock<BblMirrorReaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblRawPlayerPageLoaderService,
        { provide: ReviewPlayerConfigService, useValue: config },
        { provide: BblMirrorReaderService, useValue: mirror },
      ],
    }).compile();
    service = moduleRef.get(BblRawPlayerPageLoaderService);
  });

  it('reads the player page addressed by its pid, from the BBL data dir', async () => {
    mirror.readFile.mockResolvedValue('<h1>Janhorgh</h1>');

    expect(await service.loadPlayerPage('1000')).toBe('<h1>Janhorgh</h1>');
    expect(mirror.readFile).toHaveBeenCalledWith(
      DATA_DIR,
      'default.asp?p=pl&pid=1000',
    );
  });

  it('returns null for a page that is not in the mirror', async () => {
    mirror.readFile.mockResolvedValue(null);

    expect(await service.loadPlayerPage('4242')).toBeNull();
  });

  it('returns null for an id that does not name a real mirror file', async () => {
    mirror.readFile.mockResolvedValue(null);

    expect(await service.loadPlayerPage('../secret')).toBeNull();
  });

  it('propagates a read failure instead of swallowing it', async () => {
    mirror.readFile.mockRejectedValue(new Error('EISDIR'));

    await expect(service.loadPlayerPage('9999')).rejects.toThrow(/EISDIR/);
  });
});

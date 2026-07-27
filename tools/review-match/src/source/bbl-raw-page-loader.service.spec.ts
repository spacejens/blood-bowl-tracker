import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ReviewMatchConfigService } from '../config/review-match-config.service';
import { BblRawPageLoaderService } from './bbl-raw-page-loader.service';

describe('BblRawPageLoaderService', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bbl-raw-loader-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function makeService(dataDir = dir): Promise<BblRawPageLoaderService> {
    const config = mock<ReviewMatchConfigService>();
    config.getDataDir.mockReturnValue(dataDir);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblRawPageLoaderService,
        { provide: ReviewMatchConfigService, useValue: config },
      ],
    }).compile();
    return moduleRef.get(BblRawPageLoaderService);
  }

  it('reads the match page named after the external id', async () => {
    await writeFile(join(dir, 'default.asp?p=m&m=1830'), '<html>ok</html>');
    const service = await makeService();

    await expect(service.loadMatchPage('1830')).resolves.toBe(
      '<html>ok</html>',
    );
  });

  it('decodes the page as ISO-8859-1, not UTF-8', async () => {
    // 0xE4 is "ä" in Latin-1 and an invalid lone byte in UTF-8.
    await writeFile(
      join(dir, 'default.asp?p=m&m=7'),
      Buffer.from([0x42, 0x72, 0xe4, 0x6b]),
    );
    const service = await makeService();

    await expect(service.loadMatchPage('7')).resolves.toBe('Bräk');
  });

  it('returns null when the page file does not exist', async () => {
    const service = await makeService();

    await expect(service.loadMatchPage('404')).resolves.toBeNull();
  });

  it('returns null when the whole data directory is missing', async () => {
    const service = await makeService(join(dir, 'nope'));

    await expect(service.loadMatchPage('1')).resolves.toBeNull();
  });

  it('rethrows a non-ENOENT filesystem error instead of treating it as missing', async () => {
    // A directory in place of the page file makes readFile fail with
    // EISDIR, not ENOENT — that error must propagate.
    await mkdir(join(dir, 'default.asp?p=m&m=999'));
    const service = await makeService();

    await expect(service.loadMatchPage('999')).rejects.toThrow(/EISDIR/);
  });
});

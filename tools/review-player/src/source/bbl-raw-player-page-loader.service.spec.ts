import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { BblRawPlayerPageLoaderService } from './bbl-raw-player-page-loader.service';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-player-bbl-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('BblRawPlayerPageLoaderService', () => {
  let service: BblRawPlayerPageLoaderService;

  beforeEach(async () => {
    const config = mock<ReviewPlayerConfigService>();
    config.getDataDir.mockReturnValue(dir);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblRawPlayerPageLoaderService,
        { provide: ReviewPlayerConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(BblRawPlayerPageLoaderService);
  });

  it('reads the player page addressed by its pid', async () => {
    writeFileSync(
      join(dir, 'default.asp?p=pl&pid=1000'),
      '<h1>Janhorgh</h1>',
      'utf8',
    );

    expect(await service.loadPlayerPage('1000')).toBe('<h1>Janhorgh</h1>');
  });

  it('decodes ISO-8859-1 bytes without throwing', async () => {
    writeFileSync(
      join(dir, 'default.asp?p=pl&pid=1001'),
      Buffer.from([0x3c, 0x68, 0x31, 0x3e, 0xe4, 0x3c, 0x2f, 0x68, 0x31, 0x3e]),
    );

    expect(await service.loadPlayerPage('1001')).toBe('<h1>ä</h1>');
  });

  it('preserves 0x80-0x9F bytes as their identical code points, not Windows-1252', async () => {
    writeFileSync(join(dir, 'default.asp?p=pl&pid=1002'), Buffer.from([0x80]));

    expect(await service.loadPlayerPage('1002')).toBe('\u0080');
  });

  it('returns null for a page that is not in the mirror', async () => {
    expect(await service.loadPlayerPage('4242')).toBeNull();
  });

  it('refuses a non-numeric id rather than joining it into a path', async () => {
    expect(await service.loadPlayerPage('../secret')).toBeNull();
  });

  it('rethrows a read failure that is not a missing file', async () => {
    mkdirSync(join(dir, 'default.asp?p=pl&pid=9999'));

    await expect(service.loadPlayerPage('9999')).rejects.toThrow();
  });
});

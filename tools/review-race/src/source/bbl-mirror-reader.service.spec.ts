import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { BblMirrorReaderService } from './bbl-mirror-reader.service';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-race-bbl-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('BblMirrorReaderService', () => {
  let service: BblMirrorReaderService;

  beforeEach(async () => {
    const config = mock<RaceReviewConfigService>();
    config.getDataDir.mockReturnValue(dir);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblMirrorReaderService,
        { provide: RaceReviewConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(BblMirrorReaderService);
  });

  it('reads a mirror file addressed by filename', async () => {
    writeFileSync(join(dir, 'default.asp?p=tl'), '<h1>Race List</h1>', 'utf8');

    expect(await service.readPage('default.asp?p=tl')).toBe(
      '<h1>Race List</h1>',
    );
  });

  it('decodes ISO-8859-1 bytes without throwing', async () => {
    writeFileSync(
      join(dir, 'default.asp?p=tl'),
      Buffer.from([0x3c, 0x68, 0x31, 0x3e, 0xe4, 0x3c, 0x2f, 0x68, 0x31, 0x3e]),
    );

    expect(await service.readPage('default.asp?p=tl')).toBe('<h1>ä</h1>');
  });

  it('preserves 0x80-0x9F bytes as their identical code points, not Windows-1252', async () => {
    writeFileSync(join(dir, 'default.asp?p=tl'), Buffer.from([0x80]));

    expect(await service.readPage('default.asp?p=tl')).toBe('');
  });

  it('returns null for a page that is not in the mirror', async () => {
    expect(await service.readPage('default.asp?p=tl')).toBeNull();
  });

  it('refuses a path traversal attempt rather than joining it into a path', async () => {
    expect(await service.readPage('../secret')).toBeNull();
  });

  it('rethrows a read failure that is not a missing file', async () => {
    mkdirSync(join(dir, 'default.asp?p=tl'));

    await expect(service.readPage('default.asp?p=tl')).rejects.toThrow();
  });

  it('returns team page filenames matching the pattern, sorted', async () => {
    writeFileSync(join(dir, 'default.asp?p=tm&t=ABC'), '');
    writeFileSync(join(dir, 'default.asp?p=tm&t=DEF'), '');
    writeFileSync(join(dir, 'default.asp?p=tl'), '');
    writeFileSync(join(dir, 'notes.txt'), '');

    expect(await service.listTeamPageFilenames()).toEqual([
      'default.asp?p=tm&t=ABC',
      'default.asp?p=tm&t=DEF',
    ]);
  });

  it('rethrows a listing failure that is not a missing directory', async () => {
    const notADir = join(dir, 'default.asp?p=tl');
    writeFileSync(notADir, '');
    const config = mock<RaceReviewConfigService>();
    config.getDataDir.mockReturnValue(notADir);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblMirrorReaderService,
        { provide: RaceReviewConfigService, useValue: config },
      ],
    }).compile();
    const serviceWithFileAsDir = moduleRef.get(BblMirrorReaderService);

    await expect(
      serviceWithFileAsDir.listTeamPageFilenames(),
    ).rejects.toThrow();
  });

  it('returns an empty array when the data directory does not exist', async () => {
    const config = mock<RaceReviewConfigService>();
    config.getDataDir.mockReturnValue(join(dir, 'nonexistent'));
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblMirrorReaderService,
        { provide: RaceReviewConfigService, useValue: config },
      ],
    }).compile();
    const serviceWithMissing = moduleRef.get(BblMirrorReaderService);

    expect(await serviceWithMissing.listTeamPageFilenames()).toEqual([]);
  });
});

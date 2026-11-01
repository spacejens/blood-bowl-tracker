import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BblMirrorReaderService } from './bbl-mirror-reader.service';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'read-bbl-mirror-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('BblMirrorReaderService', () => {
  let service: BblMirrorReaderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BblMirrorReaderService],
    }).compile();
    service = moduleRef.get(BblMirrorReaderService);
  });

  describe('readFile', () => {
    it('reads a file addressed by its filename', async () => {
      writeFileSync(
        join(dir, 'default.asp?p=tl'),
        '<h1>Race List</h1>',
        'utf8',
      );

      expect(await service.readFile(dir, 'default.asp?p=tl')).toBe(
        '<h1>Race List</h1>',
      );
    });

    it('decodes a byte above 0x9F as its Latin-1 character', async () => {
      // 0xE4 is a-umlaut in Windows-1252 and an invalid lone byte in UTF-8.
      writeFileSync(
        join(dir, 'page'),
        Buffer.from([
          0x3c, 0x68, 0x31, 0x3e, 0xe4, 0x3c, 0x2f, 0x68, 0x31, 0x3e,
        ]),
      );

      expect(await service.readFile(dir, 'page')).toBe('<h1>ä</h1>');
    });

    it('decodes 0x92 as a right single quotation mark', async () => {
      // "Sydow" 0x92 "s", as BBL spells "Doctor Sydow's Mistakes".
      writeFileSync(
        join(dir, 'page'),
        Buffer.from([0x53, 0x79, 0x64, 0x6f, 0x77, 0x92, 0x73]),
      );

      expect(await service.readFile(dir, 'page')).toBe('Sydow’s');
    });

    it.each([
      ['0x80', 0x80, '€'],
      ['0x85', 0x85, '…'],
      ['0x91', 0x91, '‘'],
      ['0x93', 0x93, '“'],
      ['0x94', 0x94, '”'],
      ['0x96', 0x96, '–'],
      ['0x97', 0x97, '—'],
      ['0x9E', 0x9e, 'ž'],
    ])(
      'decodes byte %s as its Windows-1252 character',
      async (_label, byte, expected) => {
        writeFileSync(join(dir, 'page'), Buffer.from([byte]));

        expect(await service.readFile(dir, 'page')).toBe(expected);
      },
    );

    it('decodes the five bytes Windows-1252 leaves undefined to C1 controls without throwing', async () => {
      writeFileSync(
        join(dir, 'page'),
        Buffer.from([0x81, 0x8d, 0x8f, 0x90, 0x9d]),
      );

      expect(await service.readFile(dir, 'page')).toBe(
        '\u0081\u008d\u008f\u0090\u009d',
      );
    });

    it('returns null for a file that is not there', async () => {
      expect(await service.readFile(dir, 'missing')).toBeNull();
    });

    it('returns null when the whole data directory is missing', async () => {
      expect(await service.readFile(join(dir, 'nope'), 'page')).toBeNull();
    });

    it('returns null for a filename containing a forward slash', async () => {
      expect(await service.readFile(dir, 'sub/page')).toBeNull();
    });

    it('returns null for a filename containing a backslash', async () => {
      expect(await service.readFile(dir, 'sub\\page')).toBeNull();
    });

    it('returns null for a parent-directory filename', async () => {
      expect(await service.readFile(dir, '..')).toBeNull();
    });

    it('rejects an unsafe filename without reading the file it points at', async () => {
      // The escape target exists and is readable, so a null here can only
      // come from the safety check, never from a failed read.
      const outside = mkdtempSync(join(tmpdir(), 'read-bbl-mirror-outside-'));
      try {
        writeFileSync(join(outside, 'secret'), 'top secret', 'utf8');
        const escape = `../${outside.split('/').pop() ?? ''}/secret`;

        expect(await service.readFile(dir, escape)).toBeNull();
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it('rethrows a read failure that is not a missing file', async () => {
      // A directory where the file should be fails with EISDIR, not ENOENT.
      mkdirSync(join(dir, 'page'));

      await expect(service.readFile(dir, 'page')).rejects.toThrow();
    });
  });

  describe('listFiles', () => {
    it('returns the plain filenames in the directory', async () => {
      writeFileSync(join(dir, 'b-file'), '');
      writeFileSync(join(dir, 'a-file'), '');

      expect((await service.listFiles(dir)).sort()).toEqual([
        'a-file',
        'b-file',
      ]);
    });

    it('excludes subdirectories', async () => {
      writeFileSync(join(dir, 'a-file'), '');
      mkdirSync(join(dir, 'a-directory'));

      expect(await service.listFiles(dir)).toEqual(['a-file']);
    });

    it('returns an empty array when the directory does not exist', async () => {
      expect(await service.listFiles(join(dir, 'nonexistent'))).toEqual([]);
    });

    it('rethrows a listing failure that is not a missing directory', async () => {
      const notADir = join(dir, 'a-file');
      writeFileSync(notADir, '');

      await expect(service.listFiles(notADir)).rejects.toThrow();
    });
  });
});

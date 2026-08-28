import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import JSON5 from 'json5';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createConfigLoaderServiceBase } from './config-loader-service-base';

const TEST_CONFIG_PATH = Symbol('TEST_CONFIG_PATH');

/** A lenient top-level schema, as the four real call sites use. */
@Injectable()
class LenientConfigService extends createConfigLoaderServiceBase({
  pathToken: TEST_CONFIG_PATH,
  schema: z.looseObject({}).catch(() => ({})),
}) {}

/** A strict top-level schema, to prove validation failures propagate. */
@Injectable()
class StrictConfigService extends createConfigLoaderServiceBase({
  pathToken: TEST_CONFIG_PATH,
  schema: z.looseObject({ league: z.string() }),
}) {}

describe('createConfigLoaderServiceBase', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'config-loader-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(contents: string): string {
    const path = join(dir, 'test-config.json5');
    writeFileSync(path, contents, 'utf8');
    return path;
  }

  async function makeService(filePath: string): Promise<LenientConfigService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LenientConfigService,
        { provide: TEST_CONFIG_PATH, useValue: filePath },
      ],
    }).compile();
    return moduleRef.get(LenientConfigService);
  }

  it('treats a missing file as an empty config', async () => {
    const service = await makeService(join(dir, 'does-not-exist.json5'));
    expect(service.get('connection')).toBeUndefined();
  });

  it('parses JSON5 (comments, trailing commas, unquoted keys)', async () => {
    const path = writeConfig(`{
      // a comment
      league: { leagueName: 'tLoEG' },
      dataDir: 'data/',
    }`);
    const service = await makeService(path);
    expect(service.get<{ leagueName: string }>('league')?.leagueName).toBe(
      'tLoEG',
    );
    expect(service.get('dataDir')).toBe('data/');
  });

  it('returns undefined for a key the file does not carry', async () => {
    const service = await makeService(writeConfig(`{ dataDir: 'data/' }`));
    expect(service.get('connection')).toBeUndefined();
  });

  it('throws with the file path when the file is not valid JSON5', async () => {
    const path = writeConfig('{ this is : not valid');
    await expect(makeService(path)).rejects.toThrow(path);
  });

  it('names the failing file in the wrapped parse error', async () => {
    const path = writeConfig('{ this is : not valid');
    await expect(makeService(path)).rejects.toThrow(`Failed to parse ${path}`);
  });

  it('stringifies a non-Error thrown while parsing', async () => {
    const path = writeConfig(`{ dataDir: 'data/' }`);
    const parseSpy = vi.spyOn(JSON5, 'parse').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising the non-Error branch of the parse-error handler
      throw 'boom';
    });
    try {
      await expect(makeService(path)).rejects.toThrow(
        `Failed to parse ${path}: boom`,
      );
    } finally {
      parseSpy.mockRestore();
    }
  });

  it('rethrows a read failure that is not ENOENT', async () => {
    // Reading a directory fails with EISDIR, not ENOENT.
    await expect(makeService(dir)).rejects.toThrow();
  });

  it('applies the caller-supplied schema to the parsed value', async () => {
    const path = writeConfig(`{ league: 42 }`);
    await expect(
      Test.createTestingModule({
        providers: [
          StrictConfigService,
          { provide: TEST_CONFIG_PATH, useValue: path },
        ],
      }).compile(),
    ).rejects.toThrow(`Failed to validate ${path}`);
  });

  it('accepts a value the caller-supplied schema allows', async () => {
    const path = writeConfig(`{ league: 'tLoEG' }`);
    const moduleRef = await Test.createTestingModule({
      providers: [
        StrictConfigService,
        { provide: TEST_CONFIG_PATH, useValue: path },
      ],
    }).compile();
    expect(moduleRef.get(StrictConfigService).get('league')).toBe('tLoEG');
  });
});

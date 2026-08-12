import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  REVIEW_PLAYER_CONFIG_PATH,
  ReviewPlayerConfigService,
} from './review-player-config.service';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-player-config-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function makeService(
  contents?: string,
): Promise<ReviewPlayerConfigService> {
  const path = join(dir, 'review-player-config.json5');
  if (contents !== undefined) {
    writeFileSync(path, contents, 'utf8');
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      ReviewPlayerConfigService,
      { provide: REVIEW_PLAYER_CONFIG_PATH, useValue: path },
    ],
  }).compile();
  return moduleRef.get(ReviewPlayerConfigService);
}

describe('ReviewPlayerConfigService', () => {
  it('reads the database url', async () => {
    const service = await makeService(
      "{ database: { url: 'postgres://u:p@h/db' } }",
    );

    expect(service.getDatabaseUrl()).toBe('postgres://u:p@h/db');
  });

  it('throws a helpful error when the database url is missing', async () => {
    const service = await makeService('{}');

    expect(() => service.getDatabaseUrl()).toThrow(
      /database\.url is not set in review-player-config\.json5/,
    );
  });

  it('defaults playersPerStratum to 3', async () => {
    const service = await makeService('{}');

    expect(service.getPlayersPerStratum()).toBe(3);
  });

  it('rejects a non-positive playersPerStratum', async () => {
    const service = await makeService('{ playersPerStratum: 0 }');

    expect(() => service.getPlayersPerStratum()).toThrow(
      /must be a positive integer/,
    );
  });

  it('resolves a relative data dir to an absolute path', async () => {
    const service = await makeService(
      "{ bbl: { dataDir: '../import-bbl/data' } }",
    );

    expect(service.getDataDir('bbl')).toBe(resolve('../import-bbl/data'));
  });

  it('throws a helpful error when a data dir is missing', async () => {
    const service = await makeService('{}');

    expect(() => service.getDataDir('bbl')).toThrow(
      /bbl\.dataDir is not set in review-player-config\.json5/,
    );
  });

  it('defaults each external system name', async () => {
    const service = await makeService('{}');

    expect(service.getExternalSystemName('bbl')).toBe('BBL');
    expect(service.getExternalSystemName('tp')).toBe('TP');
  });

  it('uses a configured external system name over the default', async () => {
    const service = await makeService(
      "{ bbl: { externalSystemName: 'BBL Legacy' } }",
    );

    expect(service.getExternalSystemName('bbl')).toBe('BBL Legacy');
  });

  it('reads per-source overrides as strings', async () => {
    const service = await makeService('{ overrides: { bbl: [1000, "1001"] } }');

    expect(service.getOverrides('bbl')).toEqual(['1000', '1001']);
    expect(service.getOverrides('tp')).toEqual([]);
  });

  it('rejects a non-array overrides entry', async () => {
    const service = await makeService("{ overrides: { tp: 'nope' } }");

    expect(() => service.getOverrides('tp')).toThrow(
      /overrides\.tp in review-player-config\.json5 must be an array/,
    );
  });

  it('defaults the output path', async () => {
    const service = await makeService('{}');

    expect(service.getOutputPath()).toBe(resolve('output/report.html'));
  });

  it('resolves a configured output path over the default', async () => {
    const service = await makeService("{ outputPath: 'out/custom.html' }");

    expect(service.getOutputPath()).toBe(resolve('out/custom.html'));
  });

  it('treats a missing config file as empty', async () => {
    const service = await makeService();

    expect(service.getPlayersPerStratum()).toBe(3);
  });

  it('treats a non-object top-level config value as empty', async () => {
    const service = await makeService('42');

    expect(service.getPlayersPerStratum()).toBe(3);
  });

  it('fails loudly on an unparseable config file', async () => {
    await expect(makeService('{ not json5 ')).rejects.toThrow(
      /Failed to parse/,
    );
  });
});

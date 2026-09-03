import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ReviewConfigServiceBase } from './review-config-base.service';

const CONFIG_PATH = Symbol('TEST_CONFIG_PATH');

/** Minimal concrete subclass, standing in for a real tool's config service. */
@Injectable()
class TestConfigService extends ReviewConfigServiceBase {
  constructor(@Inject(CONFIG_PATH) filePath: string) {
    super({
      filePath,
      fileName: 'review-test-config.json5',
      overrideLabel: 'external test ids',
    });
  }

  getThingsPerStratum(): number {
    return this.positiveInteger('thingsPerStratum', 3);
  }
}

describe('ReviewConfigServiceBase', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'review-harness-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeServiceAt(path: string): Promise<TestConfigService> {
    const moduleRef = await Test.createTestingModule({
      providers: [TestConfigService, { provide: CONFIG_PATH, useValue: path }],
    }).compile();
    return moduleRef.get(TestConfigService);
  }

  async function makeService(contents = '{}'): Promise<TestConfigService> {
    const path = join(dir, 'review-test-config.json5');
    writeFileSync(path, contents, 'utf8');
    return makeServiceAt(path);
  }

  describe('getDatabaseUrl', () => {
    it('returns the configured url', async () => {
      const service = await makeService(
        "{ database: { url: 'postgres://u:p@localhost:5433/db' } }",
      );

      expect(service.getDatabaseUrl()).toBe('postgres://u:p@localhost:5433/db');
    });

    it('names the tool config file when database.url is missing', async () => {
      const service = await makeService('{}');

      expect(() => service.getDatabaseUrl()).toThrow(
        /database\.url is not set in review-test-config\.json5/,
      );
    });
  });

  describe('positiveInteger', () => {
    it('falls back to the default when unset', async () => {
      const service = await makeService('{}');

      expect(service.getThingsPerStratum()).toBe(3);
    });

    it('returns the configured value', async () => {
      const service = await makeService('{ thingsPerStratum: 5 }');

      expect(service.getThingsPerStratum()).toBe(5);
    });

    it('throws when the configured value is not a positive integer', async () => {
      const service = await makeService('{ thingsPerStratum: 0 }');

      expect(() => service.getThingsPerStratum()).toThrow(
        /thingsPerStratum in review-test-config\.json5 must be a positive integer; got 0\./,
      );
    });
  });

  describe('getDataDir', () => {
    it('resolves the configured directory against the working directory', async () => {
      const service = await makeService("{ bbl: { dataDir: 'some/where' } }");

      expect(service.getDataDir('bbl')).toBe(resolve('some/where'));
    });

    it('throws a source-specific error when unset', async () => {
      const service = await makeService('{}');

      expect(() => service.getDataDir('tp')).toThrow(
        /tp\.dataDir is not set in review-test-config\.json5.*downloaded TP data/,
      );
    });

    it('describes manual data as curated rather than downloaded when unset', async () => {
      const service = await makeService('{}');

      expect(() => service.getDataDir('manual')).toThrow(
        /manual\.dataDir is not set in review-test-config\.json5.*tools\/import-manual's curated data/,
      );
      expect(() => service.getDataDir('manual')).not.toThrow(/downloaded/);
    });
  });

  describe('getExternalSystemName', () => {
    it('defaults to the uppercased source key', async () => {
      const service = await makeService('{}');

      expect(service.getExternalSystemName('bbl')).toBe('BBL');
      expect(service.getExternalSystemName('tp')).toBe('TP');
    });

    it('returns the configured name', async () => {
      const service = await makeService(
        "{ tp: { externalSystemName: 'TourPlay' } }",
      );

      expect(service.getExternalSystemName('tp')).toBe('TourPlay');
    });
  });

  describe('getOverrides', () => {
    it('defaults to an empty list', async () => {
      const service = await makeService('{}');

      expect(service.getOverrides('bbl')).toEqual([]);
    });

    it('returns the configured ids as strings', async () => {
      const service = await makeService(
        "{ overrides: { bbl: ['1830', 42], tp: [] } }",
      );

      expect(service.getOverrides('bbl')).toEqual(['1830', '42']);
    });

    it("throws naming the subclass's override label when the value is not an array", async () => {
      const service = await makeService("{ overrides: { tp: 'nope' } }");

      expect(() => service.getOverrides('tp')).toThrow(
        /overrides\.tp in review-test-config\.json5 must be an array of external test ids\./,
      );
    });
  });

  describe('getOutputPath', () => {
    it('defaults to output/report.html resolved against the working directory', async () => {
      const service = await makeService('{}');

      expect(service.getOutputPath()).toBe(resolve('output/report.html'));
    });

    it('resolves a configured path', async () => {
      const service = await makeService("{ outputPath: 'out/x.html' }");

      expect(service.getOutputPath()).toBe(resolve('out/x.html'));
    });
  });

  it('treats a missing config file as empty so each getter reports its own field', async () => {
    const service = await makeServiceAt(join(dir, 'does-not-exist.json5'));

    expect(service.getThingsPerStratum()).toBe(3);
    expect(() => service.getDatabaseUrl()).toThrow(/database\.url is not set/);
  });

  it('rethrows a non-ENOENT filesystem error instead of treating it as missing', async () => {
    // A directory at the config path makes readFileSync fail with EISDIR,
    // not ENOENT — that error must propagate rather than be swallowed.
    const path = join(dir, 'review-test-config.json5');
    mkdirSync(path);

    await expect(makeServiceAt(path)).rejects.toThrow(/EISDIR/);
  });

  it('throws with the file path when the config file is not valid JSON5', async () => {
    const path = join(dir, 'review-test-config.json5');
    writeFileSync(path, '{ this is not json5', 'utf8');

    await expect(makeServiceAt(path)).rejects.toThrow(
      /Failed to parse .*review-test-config\.json5/,
    );
  });

  it('treats a non-object config document as empty', async () => {
    const service = await makeService('42');

    expect(service.getThingsPerStratum()).toBe(3);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  REVIEW_MATCH_CONFIG_PATH,
  ReviewMatchConfigService,
} from './review-match-config.service';

describe('ReviewMatchConfigService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'review-match-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeService(
    contents = '{}',
  ): Promise<ReviewMatchConfigService> {
    const path = join(dir, 'review-match-config.json5');
    writeFileSync(path, contents, 'utf8');
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewMatchConfigService,
        { provide: REVIEW_MATCH_CONFIG_PATH, useValue: path },
      ],
    }).compile();
    return moduleRef.get(ReviewMatchConfigService);
  }

  describe('getDatabaseUrl', () => {
    it('returns the configured url', async () => {
      const service = await makeService(
        "{ database: { url: 'postgres://u:p@localhost:5433/db' } }",
      );

      expect(service.getDatabaseUrl()).toBe('postgres://u:p@localhost:5433/db');
    });

    it('throws a helpful error when database.url is missing', async () => {
      const service = await makeService('{}');

      expect(() => service.getDatabaseUrl()).toThrow(
        /database\.url is not set in review-match-config\.json5/,
      );
    });
  });

  describe('getMatchesPerStratum', () => {
    it('defaults to 3 when unset', async () => {
      const service = await makeService('{}');

      expect(service.getMatchesPerStratum()).toBe(3);
    });

    it('returns the configured value', async () => {
      const service = await makeService('{ matchesPerStratum: 5 }');

      expect(service.getMatchesPerStratum()).toBe(5);
    });

    it('throws when the configured value is not a positive integer', async () => {
      const service = await makeService('{ matchesPerStratum: 0 }');

      expect(() => service.getMatchesPerStratum()).toThrow(
        /matchesPerStratum in review-match-config\.json5 must be a positive integer/,
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
        /tp\.dataDir is not set in review-match-config\.json5/,
      );
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

    it('throws when the configured value is not an array', async () => {
      const service = await makeService("{ overrides: { tp: 'nope' } }");

      expect(() => service.getOverrides('tp')).toThrow(
        /overrides\.tp in review-match-config\.json5 must be an array/,
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
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewMatchConfigService,
        {
          provide: REVIEW_MATCH_CONFIG_PATH,
          useValue: join(dir, 'does-not-exist.json5'),
        },
      ],
    }).compile();
    const service = moduleRef.get(ReviewMatchConfigService);

    expect(service.getMatchesPerStratum()).toBe(3);
    expect(() => service.getDatabaseUrl()).toThrow(/database\.url is not set/);
  });

  it('rethrows a non-ENOENT filesystem error instead of treating it as missing', async () => {
    // A directory at the config path makes readFileSync fail with EISDIR,
    // not ENOENT — that error must propagate rather than be swallowed.
    const path = join(dir, 'review-match-config.json5');
    mkdirSync(path);

    await expect(
      Test.createTestingModule({
        providers: [
          ReviewMatchConfigService,
          { provide: REVIEW_MATCH_CONFIG_PATH, useValue: path },
        ],
      }).compile(),
    ).rejects.toThrow(/EISDIR/);
  });

  it('throws with the file path when the config file is not valid JSON5', async () => {
    const path = join(dir, 'review-match-config.json5');
    writeFileSync(path, '{ this is not json5', 'utf8');

    await expect(
      Test.createTestingModule({
        providers: [
          ReviewMatchConfigService,
          { provide: REVIEW_MATCH_CONFIG_PATH, useValue: path },
        ],
      }).compile(),
    ).rejects.toThrow(/Failed to parse .*review-match-config\.json5/);
  });
});

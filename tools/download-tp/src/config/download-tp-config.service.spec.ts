import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DOWNLOAD_TP_CONFIG_PATH,
  DownloadTpConfigService,
} from './download-tp-config.service';

const VALID_CONFIG = `{
  // a comment
  connection: {
    frontendUrl: 'https://tp.example/blood-bowl/',
    backendApiUrl: 'https://tp.example/api/',
  },
  browser: { enabled: true, headless: true },
  download: { tournaments: ['season-29', 'season-30'] },
}`;

describe('DownloadTpConfigService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'download-tp-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(contents: string): string {
    const path = join(dir, 'download-tp-config.json5');
    writeFileSync(path, contents, 'utf8');
    return path;
  }

  function missingPath(): string {
    return join(dir, 'does-not-exist.json5');
  }

  async function makeService(
    configPath: string,
  ): Promise<DownloadTpConfigService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DownloadTpConfigService,
        { provide: DOWNLOAD_TP_CONFIG_PATH, useValue: configPath },
      ],
    }).compile();
    return moduleRef.get(DownloadTpConfigService);
  }

  it('treats a missing file as an empty config', async () => {
    const service = await makeService(missingPath());
    expect(service.get('connection')).toBeUndefined();
    expect(service.get('download')).toBeUndefined();
  });

  it('throws with the file path when the file is not valid JSON5', async () => {
    const path = writeConfig('{ this is : not valid');
    await expect(makeService(path)).rejects.toThrow(path);
  });

  it('ignores a file whose top level is not an object', async () => {
    const path = writeConfig(`'just a string'`);
    const service = await makeService(path);
    expect(service.get('connection')).toBeUndefined();
  });

  it('parses JSON5 (comments, trailing commas, unquoted keys)', async () => {
    const service = await makeService(writeConfig(VALID_CONFIG));
    expect(service.getFrontendUrl()).toBe('https://tp.example/blood-bowl/');
    expect(service.getBackendApiUrl()).toBe('https://tp.example/api/');
    expect(service.isBrowserEnabled()).toBe(true);
    expect(service.isHeadless()).toBe(true);
    expect(service.getTournaments()).toEqual(['season-29', 'season-30']);
  });

  it('throws for both connection URLs when the file is missing', async () => {
    const service = await makeService(missingPath());
    expect(() => service.getFrontendUrl()).toThrow(
      'connection is not set in download-tp-config.json5',
    );
    expect(() => service.getBackendApiUrl()).toThrow(
      'connection is not set in download-tp-config.json5',
    );
  });

  it('throws when connection is not an object', async () => {
    const path = writeConfig(`{ connection: 'https://tp.example/' }`);
    const service = await makeService(path);
    expect(() => service.getFrontendUrl()).toThrow(
      'connection is not set in download-tp-config.json5',
    );
  });

  it('throws when connection is null', async () => {
    const path = writeConfig(`{ connection: null }`);
    const service = await makeService(path);
    expect(() => service.getFrontendUrl()).toThrow(
      'connection is not set in download-tp-config.json5',
    );
  });

  it('throws when frontendUrl is missing', async () => {
    const path = writeConfig(
      `{ connection: { backendApiUrl: 'https://tp.example/api/' } }`,
    );
    const service = await makeService(path);
    expect(() => service.getFrontendUrl()).toThrow(
      'connection.frontendUrl is not set in download-tp-config.json5',
    );
  });

  it('throws when frontendUrl is an empty string', async () => {
    const path = writeConfig(`{ connection: { frontendUrl: '' } }`);
    const service = await makeService(path);
    expect(() => service.getFrontendUrl()).toThrow(
      'connection.frontendUrl is not set in download-tp-config.json5',
    );
  });

  it('throws when backendApiUrl is missing', async () => {
    const path = writeConfig(
      `{ connection: { frontendUrl: 'https://tp.example/blood-bowl/' } }`,
    );
    const service = await makeService(path);
    expect(() => service.getBackendApiUrl()).toThrow(
      'connection.backendApiUrl is not set in download-tp-config.json5',
    );
  });

  it('throws when backendApiUrl is not a string', async () => {
    const path = writeConfig(`{ connection: { backendApiUrl: 42 } }`);
    const service = await makeService(path);
    expect(() => service.getBackendApiUrl()).toThrow(
      'connection.backendApiUrl is not set in download-tp-config.json5',
    );
  });

  it('throws when download is not set', async () => {
    const service = await makeService(writeConfig(`{}`));
    expect(() => service.getTournaments()).toThrow(
      'download is not set in download-tp-config.json5',
    );
  });

  it('throws when download is null', async () => {
    const service = await makeService(writeConfig(`{ download: null }`));
    expect(() => service.getTournaments()).toThrow(
      'download is not set in download-tp-config.json5',
    );
  });

  it('throws when tournaments is missing', async () => {
    const service = await makeService(writeConfig(`{ download: {} }`));
    expect(() => service.getTournaments()).toThrow(
      'download.tournaments is not set in download-tp-config.json5',
    );
  });

  it('throws when tournaments is not an array', async () => {
    const service = await makeService(
      writeConfig(`{ download: { tournaments: 'season-30' } }`),
    );
    expect(() => service.getTournaments()).toThrow(
      'download.tournaments is not set in download-tp-config.json5',
    );
  });

  it('throws when tournaments contains a non-string entry', async () => {
    const service = await makeService(
      writeConfig(`{ download: { tournaments: ['season-30', 30] } }`),
    );
    expect(() => service.getTournaments()).toThrow(
      'download.tournaments is not set in download-tp-config.json5',
    );
  });

  it('throws when tournaments contains an empty string', async () => {
    const service = await makeService(
      writeConfig(`{ download: { tournaments: [''] } }`),
    );
    expect(() => service.getTournaments()).toThrow(
      'download.tournaments is not set in download-tp-config.json5',
    );
  });

  describe('getRulesSets', () => {
    it('reads the configured rules sets', async () => {
      const service = await makeService(
        writeConfig(
          `{ download: { tournaments: [], rulesSets: ['BB2020', 'DB2021'] } }`,
        ),
      );
      expect(service.getRulesSets()).toEqual(['BB2020', 'DB2021']);
    });

    it('throws naming the key when the download group is missing', async () => {
      const service = await makeService(writeConfig(`{}`));
      expect(() => service.getRulesSets()).toThrow(/download is not set/);
    });

    it('throws naming the key when rulesSets is missing entirely', async () => {
      const missing = await makeService(
        writeConfig(`{ download: { tournaments: [] } }`),
      );
      expect(() => missing.getRulesSets()).toThrow(/download\.rulesSets/);
    });

    it('accepts an empty rulesSets list, skipping the official-teams download entirely', async () => {
      const empty = await makeService(
        writeConfig(`{ download: { tournaments: [], rulesSets: [] } }`),
      );
      expect(empty.getRulesSets()).toEqual([]);
    });
  });

  describe('getTournaments with the relaxed schema', () => {
    it('accepts an empty tournaments list', async () => {
      const service = await makeService(
        writeConfig(`{ download: { tournaments: [], rulesSets: ['BB2020'] } }`),
      );
      expect(service.getTournaments()).toEqual([]);
    });

    it('still throws when tournaments is absent entirely', async () => {
      const service = await makeService(
        writeConfig(`{ download: { rulesSets: ['BB2020'] } }`),
      );
      expect(() => service.getTournaments()).toThrow(/download\.tournaments/);
    });
  });

  describe('isBrowserEnabled', () => {
    it('reads browser.enabled true', async () => {
      const service = await makeService(
        writeConfig(`{ browser: { enabled: true } }`),
      );
      expect(service.isBrowserEnabled()).toBe(true);
    });

    it('reads browser.enabled false', async () => {
      const service = await makeService(
        writeConfig(`{ browser: { enabled: false, headless: true } }`),
      );
      expect(service.isBrowserEnabled()).toBe(false);
    });

    it('throws naming the key, with an example, when the file is missing', async () => {
      const service = await makeService(missingPath());
      expect(() => service.isBrowserEnabled()).toThrow(
        'browser.enabled is not set in download-tp-config.json5. Set it to ' +
          'true to download by driving a real browser, or false to fetch ' +
          'over plain HTTP, e.g. browser: { enabled: true, headless: false }.',
      );
    });

    it('throws when browser is not an object', async () => {
      const service = await makeService(writeConfig(`{ browser: 'yes' }`));
      expect(() => service.isBrowserEnabled()).toThrow(
        'browser.enabled is not set in download-tp-config.json5',
      );
    });

    it('throws when browser is null', async () => {
      const service = await makeService(writeConfig(`{ browser: null }`));
      expect(() => service.isBrowserEnabled()).toThrow(
        'browser.enabled is not set in download-tp-config.json5',
      );
    });

    it('throws when enabled is missing', async () => {
      const service = await makeService(
        writeConfig(`{ browser: { headless: false } }`),
      );
      expect(() => service.isBrowserEnabled()).toThrow(
        'browser.enabled is not set in download-tp-config.json5',
      );
    });

    it('throws when enabled is not a boolean', async () => {
      const service = await makeService(
        writeConfig(`{ browser: { enabled: 'true' } }`),
      );
      expect(() => service.isBrowserEnabled()).toThrow(
        'browser.enabled is not set in download-tp-config.json5',
      );
    });
  });

  describe('isHeadless', () => {
    it('is true only for an explicit headless true', async () => {
      const service = await makeService(
        writeConfig(`{ browser: { enabled: true, headless: true } }`),
      );
      expect(service.isHeadless()).toBe(true);
    });

    it('defaults to false when browser is absent', async () => {
      const service = await makeService(writeConfig(`{}`));
      expect(service.isHeadless()).toBe(false);
    });

    it('defaults to false when browser is not an object', async () => {
      const service = await makeService(writeConfig(`{ browser: 'yes' }`));
      expect(service.isHeadless()).toBe(false);
    });

    it('defaults to false when headless is absent', async () => {
      const service = await makeService(
        writeConfig(`{ browser: { enabled: true } }`),
      );
      expect(service.isHeadless()).toBe(false);
    });

    it('returns false for a non-boolean headless value', async () => {
      const service = await makeService(
        writeConfig(`{ browser: { enabled: true, headless: 'true' } }`),
      );
      expect(service.isHeadless()).toBe(false);
    });
  });
});

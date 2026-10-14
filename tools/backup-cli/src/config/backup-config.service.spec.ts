import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BACKUP_CONFIG_PATH,
  BACKUP_ENV,
  BackupConfigService,
  BackupEnv,
  DEFAULT_LOCAL_DATABASE_URL,
} from './backup-config.service';

const FULL_FILE = `{
  storage: {
    endpoint: 'https://file.r2.cloudflarestorage.com',
    bucket: 'file-bucket',
    accessKeyId: 'FILE_KEY',
    secretAccessKey: 'FILE_SECRET',
  },
  database: { url: 'postgresql://file:pw@host/db' },
  retentionDays: 14,
}`;

describe('BackupConfigService', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'backup-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeService(
    options: { file?: string; env?: BackupEnv } = {},
  ): Promise<BackupConfigService> {
    const path = join(dir, 'backup-cli-config.json5');
    if (options.file !== undefined) {
      writeFileSync(path, options.file, 'utf8');
    }
    const moduleRef = await Test.createTestingModule({
      providers: [
        BackupConfigService,
        { provide: BACKUP_CONFIG_PATH, useValue: path },
        { provide: BACKUP_ENV, useValue: options.env ?? {} },
      ],
    }).compile();
    return moduleRef.get(BackupConfigService);
  }

  it('reads storage settings from the config file', async () => {
    const service = await makeService({ file: FULL_FILE });

    expect(service.getStorageSettings()).toEqual({
      endpoint: 'https://file.r2.cloudflarestorage.com',
      bucket: 'file-bucket',
      accessKeyId: 'FILE_KEY',
      secretAccessKey: 'FILE_SECRET',
    });
  });

  it('lets non-empty environment variables override the file', async () => {
    const service = await makeService({
      file: FULL_FILE,
      env: {
        BACKUP_STORAGE_ENDPOINT: 'https://env.r2.cloudflarestorage.com',
        BACKUP_STORAGE_BUCKET: 'env-bucket',
        BACKUP_STORAGE_ACCESS_KEY_ID: 'ENV_KEY',
        BACKUP_STORAGE_SECRET_ACCESS_KEY: 'ENV_SECRET',
        BACKUP_DATABASE_URL: 'postgres://env:pw@host/db',
        BACKUP_RETENTION_DAYS: '7',
      },
    });

    expect(service.getStorageSettings()).toEqual({
      endpoint: 'https://env.r2.cloudflarestorage.com',
      bucket: 'env-bucket',
      accessKeyId: 'ENV_KEY',
      secretAccessKey: 'ENV_SECRET',
    });
    expect(service.getDatabaseUrl()).toBe('postgres://env:pw@host/db');
    expect(service.getRetentionDays()).toBe(7);
  });

  it('falls back to the file when an environment variable is empty', async () => {
    const service = await makeService({
      file: FULL_FILE,
      env: { BACKUP_STORAGE_BUCKET: '' },
    });

    expect(service.getStorageSettings().bucket).toBe('file-bucket');
  });

  it('works from environment variables alone when the file is absent', async () => {
    const service = await makeService({
      env: {
        BACKUP_STORAGE_ENDPOINT: 'https://env.r2.cloudflarestorage.com',
        BACKUP_STORAGE_BUCKET: 'env-bucket',
        BACKUP_STORAGE_ACCESS_KEY_ID: 'ENV_KEY',
        BACKUP_STORAGE_SECRET_ACCESS_KEY: 'ENV_SECRET',
      },
    });

    expect(service.getStorageSettings().bucket).toBe('env-bucket');
  });

  it('names the setting and its environment variable when a storage setting is missing', async () => {
    const service = await makeService({ file: '{ storage: {} }' });

    expect(() => service.getStorageSettings()).toThrow(
      /storage\.endpoint is not set: set BACKUP_STORAGE_ENDPOINT or storage\.endpoint in backup-cli-config\.json5/,
    );
  });

  it('reads the database url from the file', async () => {
    const service = await makeService({ file: FULL_FILE });

    expect(service.getDatabaseUrl()).toBe('postgresql://file:pw@host/db');
  });

  it('rejects a database url that is not a postgres connection string, without echoing it', async () => {
    const service = await makeService({
      env: { BACKUP_DATABASE_URL: 'mysql://secret-value' },
    });

    expect(() => service.getDatabaseUrl()).toThrow(/not a postgres:\/\//);
    expect(() => service.getDatabaseUrl()).not.toThrow(/secret-value/);
  });

  it('names the database setting when it is missing', async () => {
    const service = await makeService({ file: '{}' });

    expect(() => service.getDatabaseUrl()).toThrow(/BACKUP_DATABASE_URL/);
  });

  it('defaults the retention window to 30 days', async () => {
    const service = await makeService({ file: '{}' });

    expect(service.getRetentionDays()).toBe(30);
  });

  it('reads the retention window from the file', async () => {
    const service = await makeService({ file: FULL_FILE });

    expect(service.getRetentionDays()).toBe(14);
  });

  it.each([['0'], ['-3'], ['abc'], ['1.5']])(
    'rejects a non-positive-integer retention window %s',
    async (value) => {
      const service = await makeService({
        env: { BACKUP_RETENTION_DAYS: value },
      });

      expect(() => service.getRetentionDays()).toThrow(
        /retentionDays .* must be a positive integer/,
      );
    },
  );

  it('defaults the local database to the docker-compose database when the file is absent', async () => {
    const service = await makeService();

    expect(service.getLocalDatabaseUrl()).toBe(
      'postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl',
    );
    expect(DEFAULT_LOCAL_DATABASE_URL).toBe(
      'postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl',
    );
  });

  it('defaults the local database when the file does not set it', async () => {
    const service = await makeService({ file: FULL_FILE });

    expect(service.getLocalDatabaseUrl()).toBe(DEFAULT_LOCAL_DATABASE_URL);
  });

  it('reads the local database url from the file', async () => {
    const service = await makeService({
      file: "{ localDatabase: { url: 'postgres://me@localhost:5432/scratch' } }",
    });

    expect(service.getLocalDatabaseUrl()).toBe(
      'postgres://me@localhost:5432/scratch',
    );
  });

  it('lets BACKUP_LOCAL_DATABASE_URL override the file', async () => {
    const service = await makeService({
      file: "{ localDatabase: { url: 'postgres://me@localhost:5432/scratch' } }",
      env: { BACKUP_LOCAL_DATABASE_URL: 'postgres://ci@127.0.0.1:5432/ci' },
    });

    expect(service.getLocalDatabaseUrl()).toBe(
      'postgres://ci@127.0.0.1:5432/ci',
    );
  });

  it('falls back to the default when BACKUP_LOCAL_DATABASE_URL is empty', async () => {
    const service = await makeService({
      env: { BACKUP_LOCAL_DATABASE_URL: '' },
    });

    expect(service.getLocalDatabaseUrl()).toBe(DEFAULT_LOCAL_DATABASE_URL);
  });

  it.each([["''"], ['5']])(
    'rejects a local database url in the file that is not a non-empty string: %s',
    async (value) => {
      const service = await makeService({
        file: `{ localDatabase: { url: ${value} } }`,
      });

      expect(() => service.getLocalDatabaseUrl()).toThrow(
        'localDatabase.url in backup-cli-config.json5 (or BACKUP_LOCAL_DATABASE_URL) must be a non-empty string.',
      );
    },
  );
});

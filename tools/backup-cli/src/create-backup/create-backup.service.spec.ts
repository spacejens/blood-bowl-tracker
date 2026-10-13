import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { BackupConfigService } from '../config/backup-config.service';
import { PgDumpService } from '../dump/pg-dump.service';
import { BackupStorageService } from '../storage/backup-storage.service';
import { CreateBackupService } from './create-backup.service';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

const DATABASE_URL = 'postgresql://user:pw@ep-x.neon.tech/neondb';
const KEY = 'production/2026-10-13T03-17-05.123Z.dump';

describe('CreateBackupService', () => {
  let service: CreateBackupService;
  let config: MockProxy<BackupConfigService>;
  let pgDump: MockProxy<PgDumpService>;
  let storage: MockProxy<BackupStorageService>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T03:17:05.123Z'));
    config = mock<BackupConfigService>();
    config.getDatabaseUrl.mockReturnValue(DATABASE_URL);
    config.getStorageSettings.mockReturnValue({
      endpoint: 'https://acct.r2.cloudflarestorage.com',
      bucket: 'bucket',
      accessKeyId: 'AKID',
      secretAccessKey: 'SECRET',
    });
    pgDump = mock<PgDumpService>();
    storage = mock<BackupStorageService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateBackupService,
        { provide: BackupConfigService, useValue: config },
        { provide: PgDumpService, useValue: pgDump },
        { provide: BackupStorageService, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(CreateBackupService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Simulates pg_dump leaving a (partial) file at the requested path. */
  function dumpLeavesFileThen(outcome: () => number): void {
    pgDump.dump.mockImplementation(async (request) => {
      writeFileSync(request.outputPath, 'partial');
      await Promise.resolve();
      return outcome();
    });
  }

  function workDir(): string {
    return dirname(pgDump.dump.mock.calls[0][0].outputPath);
  }

  it('dumps, uploads under a timestamped production key, and reports the result', async () => {
    pgDump.dump.mockResolvedValue(4096);

    await expect(service.run()).resolves.toEqual({
      key: KEY,
      sizeBytes: 4096,
      createdAt: '2026-10-13T03:17:05.123Z',
    });
    const dumpRequest = pgDump.dump.mock.calls[0][0];
    expect(dumpRequest.databaseUrl).toBe(DATABASE_URL);
    expect(storage.upload).toHaveBeenCalledWith({
      key: KEY,
      filePath: dumpRequest.outputPath,
    });
  });

  it('removes its temporary directory after a successful run', async () => {
    dumpLeavesFileThen(() => 1);

    await service.run();

    expect(existsSync(workDir())).toBe(false);
  });

  it('does not upload, and removes the partial dump, when pg_dump fails', async () => {
    dumpLeavesFileThen(() => {
      throw new Error('pg_dump exited with code 1');
    });

    await expect(service.run()).rejects.toThrow('pg_dump exited with code 1');
    expect(storage.upload).not.toHaveBeenCalled();
    expect(existsSync(workDir())).toBe(false);
  });

  it('propagates an upload failure and removes the dump', async () => {
    dumpLeavesFileThen(() => 1);
    storage.upload.mockRejectedValue(new Error('AccessDenied'));

    await expect(service.run()).rejects.toThrow('AccessDenied');
    expect(existsSync(workDir())).toBe(false);
  });

  it('does not let a cleanup failure mask the original error', async () => {
    dumpLeavesFileThen(() => {
      throw new Error('pg_dump exited with code 1');
    });
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw new Error('EBUSY');
    });

    await expect(service.run()).rejects.toThrow('pg_dump exited with code 1');
  });

  it('checks storage settings before spending time on a dump', async () => {
    config.getStorageSettings.mockImplementation(() => {
      throw new Error('storage.endpoint is not set');
    });

    await expect(service.run()).rejects.toThrow('storage.endpoint is not set');
    expect(pgDump.dump).not.toHaveBeenCalled();
  });
});

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { BackupConfigService } from '../config/backup-config.service';
import { PgDumpService } from '../dump/pg-dump.service';
import { BackupStorageService } from '../storage/backup-storage.service';
import { TempDirService } from '../temp-dir/temp-dir.service';
import { CreateBackupService } from './create-backup.service';

const DATABASE_URL = 'postgresql://user:pw@ep-x.neon.tech/neondb';
const KEY = 'production/2026-10-13T03-17-05.123Z.dump';
const WORK_DIR = '/tmp/backup-cli-abc123';
const OUTPUT_PATH = `${WORK_DIR}/backup.dump`;

describe('CreateBackupService', () => {
  let service: CreateBackupService;
  let config: MockProxy<BackupConfigService>;
  let pgDump: MockProxy<PgDumpService>;
  let storage: MockProxy<BackupStorageService>;
  let tempDir: MockProxy<TempDirService>;

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
    tempDir = mock<TempDirService>();
    // Canned pass-through: hands the work a fixed directory. Creating and
    // removing it is TempDirService's own, separately tested, job.
    tempDir.run.mockImplementation(
      (_prefix: string, work: (dir: string) => Promise<unknown>) =>
        work(WORK_DIR),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateBackupService,
        { provide: BackupConfigService, useValue: config },
        { provide: PgDumpService, useValue: pgDump },
        { provide: BackupStorageService, useValue: storage },
        { provide: TempDirService, useValue: tempDir },
      ],
    }).compile();
    service = moduleRef.get(CreateBackupService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dumps into a temporary directory, uploads under a timestamped production key, and reports the result', async () => {
    pgDump.dump.mockResolvedValue(4096);

    await expect(service.run()).resolves.toEqual({
      key: KEY,
      sizeBytes: 4096,
      createdAt: '2026-10-13T03:17:05.123Z',
    });
    expect(tempDir.run).toHaveBeenCalledWith(
      'backup-cli-',
      expect.any(Function),
    );
    expect(pgDump.dump).toHaveBeenCalledWith({
      databaseUrl: DATABASE_URL,
      outputPath: OUTPUT_PATH,
    });
    expect(storage.upload).toHaveBeenCalledWith({
      key: KEY,
      filePath: OUTPUT_PATH,
    });
  });

  it('does not upload when pg_dump fails', async () => {
    pgDump.dump.mockRejectedValue(new Error('pg_dump exited with code 1'));

    await expect(service.run()).rejects.toThrow('pg_dump exited with code 1');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('propagates an upload failure', async () => {
    pgDump.dump.mockResolvedValue(1);
    storage.upload.mockRejectedValue(new Error('AccessDenied'));

    await expect(service.run()).rejects.toThrow('AccessDenied');
  });

  it('checks storage settings before spending time on a dump', async () => {
    config.getStorageSettings.mockImplementation(() => {
      throw new Error('storage.endpoint is not set');
    });

    await expect(service.run()).rejects.toThrow('storage.endpoint is not set');
    expect(tempDir.run).not.toHaveBeenCalled();
    expect(pgDump.dump).not.toHaveBeenCalled();
  });
});

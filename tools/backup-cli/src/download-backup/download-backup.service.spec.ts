import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { BackupStorageService } from '../storage/backup-storage.service';
import { StoredBackup } from '../storage/stored-backup';
import { DownloadBackupService } from './download-backup.service';

const NEWEST: StoredBackup = {
  key: 'production/new.dump',
  sizeBytes: 5,
  lastModified: '2026-10-12T03:17:00.000Z',
};
const OLDER: StoredBackup = {
  key: 'production/old.dump',
  sizeBytes: 1,
  lastModified: '2026-10-01T03:17:00.000Z',
};

describe('DownloadBackupService', () => {
  let service: DownloadBackupService;
  let storage: MockProxy<BackupStorageService>;
  let dir: string;
  let destinationPath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'download-backup-'));
    destinationPath = join(dir, 'backup.dump');
    storage = mock<BackupStorageService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DownloadBackupService,
        { provide: BackupStorageService, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(DownloadBackupService);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Stands in for the bytes the (mocked) storage download would write. */
  function givenDownloadedFile(contents: string): void {
    writeFileSync(destinationPath, contents);
  }

  it('downloads the newest backup when no key is given', async () => {
    storage.list.mockResolvedValue([NEWEST, OLDER]);
    givenDownloadedFile('12345');

    await expect(service.run({ destinationPath })).resolves.toEqual({
      key: NEWEST.key,
      path: destinationPath,
      sizeBytes: 5,
    });
    expect(storage.download).toHaveBeenCalledWith({
      key: NEWEST.key,
      destinationPath,
    });
  });

  it('downloads the named backup without listing', async () => {
    givenDownloadedFile('1');

    await expect(
      service.run({ destinationPath, key: OLDER.key }),
    ).resolves.toMatchObject({ key: OLDER.key, sizeBytes: 1 });
    expect(storage.list).not.toHaveBeenCalled();
  });

  it('fails when no backups exist yet', async () => {
    storage.list.mockResolvedValue([]);

    await expect(service.run({ destinationPath })).rejects.toThrow(
      /No backups stored yet/,
    );
    expect(storage.download).not.toHaveBeenCalled();
  });
});

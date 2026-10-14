import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { BackupConfigService } from '../config/backup-config.service';
import { RetentionService } from '../retention/retention.service';
import { BackupStorageService } from '../storage/backup-storage.service';
import { StoredBackup } from '../storage/stored-backup';
import { PruneBackupsService } from './prune-backups.service';

const NOW = new Date('2026-10-13T03:17:00.000Z');
const NEWER: StoredBackup = {
  key: 'production/new.dump',
  sizeBytes: 2,
  lastModified: '2026-10-12T03:17:00.000Z',
};
const OLDER: StoredBackup = {
  key: 'production/old.dump',
  sizeBytes: 1,
  lastModified: '2026-08-01T03:17:00.000Z',
};

const OLDEST: StoredBackup = {
  key: 'production/oldest.dump',
  sizeBytes: 1,
  lastModified: '2026-07-01T03:17:00.000Z',
};

describe('PruneBackupsService', () => {
  let service: PruneBackupsService;
  let config: MockProxy<BackupConfigService>;
  let storage: MockProxy<BackupStorageService>;
  let retention: MockProxy<RetentionService>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    config = mock<BackupConfigService>();
    storage = mock<BackupStorageService>();
    retention = mock<RetentionService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PruneBackupsService,
        { provide: BackupConfigService, useValue: config },
        { provide: BackupStorageService, useValue: storage },
        { provide: RetentionService, useValue: retention },
      ],
    }).compile();
    service = moduleRef.get(PruneBackupsService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes the backups retention selects and reports what it did', async () => {
    config.getRetentionDays.mockReturnValue(30);
    storage.list.mockResolvedValue([NEWER, OLDER]);
    retention.selectExpired.mockReturnValue([OLDER]);

    await expect(service.run()).resolves.toEqual({
      retentionDays: 30,
      deleted: [OLDER.key],
      kept: 1,
    });
    expect(retention.selectExpired).toHaveBeenCalledWith([NEWER, OLDER], {
      now: NOW,
      retentionDays: 30,
    });
    expect(storage.delete).toHaveBeenCalledWith([OLDER.key]);
  });

  it('names the failing key and the keys already deleted on a partial failure', async () => {
    config.getRetentionDays.mockReturnValue(30);
    storage.list.mockResolvedValue([NEWER, OLDER, OLDEST]);
    retention.selectExpired.mockReturnValue([OLDER, OLDEST]);
    storage.delete
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('AccessDenied'));

    await expect(service.run()).rejects.toThrow(
      'Prune failed deleting production/oldest.dump (already deleted: production/old.dump): AccessDenied',
    );
  });

  it('reports none deleted when the first delete fails with a non-Error', async () => {
    config.getRetentionDays.mockReturnValue(30);
    storage.list.mockResolvedValue([OLDER]);
    retention.selectExpired.mockReturnValue([OLDER]);
    storage.delete.mockRejectedValueOnce('boom');

    await expect(service.run()).rejects.toThrow(
      'Prune failed deleting production/old.dump (already deleted: none): boom',
    );
  });

  it('reads the retention window before touching storage', async () => {
    config.getRetentionDays.mockImplementation(() => {
      throw new Error('retentionDays must be a positive integer');
    });

    await expect(service.run()).rejects.toThrow('positive integer');
    expect(storage.list).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('deletes nothing when retention rejects the backups', async () => {
    config.getRetentionDays.mockReturnValue(30);
    storage.list.mockResolvedValue([NEWER, OLDER]);
    retention.selectExpired.mockImplementation(() => {
      throw new Error('has an unparseable lastModified timestamp');
    });

    await expect(service.run()).rejects.toThrow('unparseable');
    expect(storage.delete).not.toHaveBeenCalled();
  });
});

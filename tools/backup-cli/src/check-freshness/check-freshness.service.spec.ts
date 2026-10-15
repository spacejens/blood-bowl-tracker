import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { BackupConfigService } from '../config/backup-config.service';
import { BackupStorageService } from '../storage/backup-storage.service';
import { StoredBackup } from '../storage/stored-backup';
import { BackupFreshnessService } from './backup-freshness.service';
import { CheckFreshnessService } from './check-freshness.service';

const NOW = new Date('2026-10-15T08:41:00.000Z');
const NEWEST: StoredBackup = {
  key: 'production/new.dump',
  sizeBytes: 2,
  lastModified: '2026-10-15T03:17:00.000Z',
};
const RESULT = {
  key: NEWEST.key,
  createdAt: NEWEST.lastModified,
  ageHours: 5.4,
  maxAgeHours: 36,
};

describe('CheckFreshnessService', () => {
  let service: CheckFreshnessService;
  let config: MockProxy<BackupConfigService>;
  let storage: MockProxy<BackupStorageService>;
  let freshness: MockProxy<BackupFreshnessService>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    config = mock<BackupConfigService>();
    storage = mock<BackupStorageService>();
    freshness = mock<BackupFreshnessService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckFreshnessService,
        { provide: BackupConfigService, useValue: config },
        { provide: BackupStorageService, useValue: storage },
        { provide: BackupFreshnessService, useValue: freshness },
      ],
    }).compile();
    service = moduleRef.get(CheckFreshnessService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('assesses the listed backups against the configured limit and now', async () => {
    config.getMaxAgeHours.mockReturnValue(36);
    storage.list.mockResolvedValue([NEWEST]);
    freshness.assess.mockReturnValue(RESULT);

    await expect(service.run()).resolves.toEqual(RESULT);
    expect(freshness.assess).toHaveBeenCalledWith([NEWEST], {
      now: NOW,
      maxAgeHours: 36,
    });
  });

  it('reads the limit before touching storage', async () => {
    config.getMaxAgeHours.mockImplementation(() => {
      throw new Error('maxAgeHours must be a positive integer');
    });

    await expect(service.run()).rejects.toThrow('positive integer');
    expect(storage.list).not.toHaveBeenCalled();
  });

  it('surfaces a stale verdict as a failure', async () => {
    config.getMaxAgeHours.mockReturnValue(36);
    storage.list.mockResolvedValue([NEWEST]);
    freshness.assess.mockImplementation(() => {
      throw new Error('older than the 36-hour limit');
    });

    await expect(service.run()).rejects.toThrow('36-hour limit');
  });

  it('surfaces a storage failure', async () => {
    config.getMaxAgeHours.mockReturnValue(36);
    storage.list.mockRejectedValue(new Error('AccessDenied'));

    await expect(service.run()).rejects.toThrow('AccessDenied');
    expect(freshness.assess).not.toHaveBeenCalled();
  });
});

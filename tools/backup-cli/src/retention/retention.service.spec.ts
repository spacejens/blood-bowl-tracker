import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { StoredBackup } from '../storage/stored-backup';
import { RetentionService } from './retention.service';

const NOW = new Date('2026-10-13T03:17:00.000Z');

function backup(key: string, lastModified: string): StoredBackup {
  return { key, sizeBytes: 1, lastModified };
}

describe('RetentionService', () => {
  let service: RetentionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RetentionService],
    }).compile();
    service = moduleRef.get(RetentionService);
  });

  it('selects nothing from an empty list', () => {
    expect(service.selectExpired([], { now: NOW, retentionDays: 30 })).toEqual(
      [],
    );
  });

  it('selects backups older than the window and keeps the rest', () => {
    const fresh = backup('fresh', '2026-10-12T03:17:00.000Z');
    const old = backup('old', '2026-09-01T03:17:00.000Z');

    expect(
      service.selectExpired([fresh, old], { now: NOW, retentionDays: 30 }),
    ).toEqual([old]);
  });

  it('keeps a backup exactly at the window boundary', () => {
    const newest = backup('newest', '2026-10-13T03:00:00.000Z');
    const boundary = backup('boundary', '2026-09-13T03:17:00.000Z');

    expect(
      service.selectExpired([newest, boundary], {
        now: NOW,
        retentionDays: 30,
      }),
    ).toEqual([]);
  });

  it('never selects the newest backup, even when every backup is past the window', () => {
    const a = backup('a', '2025-01-01T00:00:00.000Z');
    const b = backup('b', '2025-02-01T00:00:00.000Z');
    const c = backup('c', '2025-03-01T00:00:00.000Z');

    // Deliberately not in newest-first order.
    expect(
      service.selectExpired([a, c, b], { now: NOW, retentionDays: 30 }),
    ).toEqual([a, b]);
  });
});

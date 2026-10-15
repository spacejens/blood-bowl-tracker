import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { StoredBackup } from '../storage/stored-backup';
import { BackupFreshnessService } from './backup-freshness.service';

const NOW = new Date('2026-10-15T08:41:00.000Z');
const POLICY = { now: NOW, maxAgeHours: 36 };

function backup(key: string, lastModified: string): StoredBackup {
  return { key, sizeBytes: 1, lastModified };
}

describe('BackupFreshnessService', () => {
  let service: BackupFreshnessService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BackupFreshnessService],
    }).compile();
    service = moduleRef.get(BackupFreshnessService);
  });

  it('reports the newest backup when it is within the limit', () => {
    const fresh = backup('production/fresh.dump', '2026-10-15T03:17:00.000Z');
    const old = backup('production/old.dump', '2026-10-01T03:17:00.000Z');

    expect(service.assess([fresh, old], POLICY)).toEqual({
      key: 'production/fresh.dump',
      createdAt: '2026-10-15T03:17:00.000Z',
      ageHours: 5.4,
      maxAgeHours: 36,
    });
  });

  it('finds the newest backup regardless of list order', () => {
    const fresh = backup('production/fresh.dump', '2026-10-15T03:17:00.000Z');
    const old = backup('production/old.dump', '2026-10-01T03:17:00.000Z');

    expect(service.assess([old, fresh], POLICY).key).toBe(
      'production/fresh.dump',
    );
  });

  it('accepts a newest backup exactly at the limit', () => {
    const boundary = backup('production/b.dump', '2026-10-13T20:41:00.000Z');

    expect(service.assess([boundary], POLICY)).toEqual({
      key: 'production/b.dump',
      createdAt: '2026-10-13T20:41:00.000Z',
      ageHours: 36,
      maxAgeHours: 36,
    });
  });

  it('fails when the newest backup is just past the limit', () => {
    const late = backup('production/late.dump', '2026-10-13T20:40:59.999Z');

    expect(() => service.assess([late], POLICY)).toThrow(
      /production\/late\.dump .*older than the 36-hour limit/,
    );
  });

  it('fails naming the newest backup, its age and the limit when it is stale', () => {
    const stale = backup('production/stale.dump', '2026-10-13T03:17:00.000Z');

    expect(() => service.assess([stale], POLICY)).toThrow(
      'Newest backup production/stale.dump (created 2026-10-13T03:17:00.000Z) ' +
        'is 53.4 hours old, older than the 36-hour limit.',
    );
  });

  it('fails when there are no backups', () => {
    expect(() => service.assess([], POLICY)).toThrow(/No backups found/);
  });

  it('fails naming the key when a timestamp is unparseable', () => {
    const fresh = backup('production/fresh.dump', '2026-10-15T03:17:00.000Z');
    const bad = backup('production/bad.dump', 'not a date');

    expect(() => service.assess([fresh, bad], POLICY)).toThrow(
      /production\/bad\.dump.*unparseable/,
    );
  });
});

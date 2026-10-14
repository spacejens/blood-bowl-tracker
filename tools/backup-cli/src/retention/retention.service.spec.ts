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

  it('keeps a single backup even when it is past the window', () => {
    const only = backup('only', '2025-01-01T00:00:00.000Z');

    expect(
      service.selectExpired([only], { now: NOW, retentionDays: 30 }),
    ).toEqual([]);
  });

  it('selects nothing when now is earlier than every backup', () => {
    const a = backup('a', '2026-11-01T00:00:00.000Z');
    const b = backup('b', '2026-11-02T00:00:00.000Z');

    expect(
      service.selectExpired([a, b], { now: NOW, retentionDays: 30 }),
    ).toEqual([]);
  });

  it('keeps one of several backups with equal timestamps', () => {
    const a = backup('a', '2025-01-01T00:00:00.000Z');
    const b = backup('b', '2025-01-01T00:00:00.000Z');

    expect(
      service.selectExpired([a, b], { now: NOW, retentionDays: 30 }),
    ).toEqual([b]);
  });

  it('throws naming the key when the first timestamp is unparseable', () => {
    const bad = backup('bad-key', 'not a date');
    const a = backup('a', '2025-01-01T00:00:00.000Z');
    const b = backup('b', '2025-02-01T00:00:00.000Z');

    expect(() =>
      service.selectExpired([bad, a, b], { now: NOW, retentionDays: 30 }),
    ).toThrow(/bad-key.*unparseable/);
  });

  it('throws naming the key when a later timestamp is unparseable', () => {
    const a = backup('a', '2025-01-01T00:00:00.000Z');
    const bad = backup('later-bad-key', '');

    expect(() =>
      service.selectExpired([a, bad], { now: NOW, retentionDays: 30 }),
    ).toThrow(/later-bad-key.*unparseable/);
  });

  it('throws when retentionDays is not a finite number', () => {
    const a = backup('a', '2025-01-01T00:00:00.000Z');

    expect(() =>
      service.selectExpired([a], { now: NOW, retentionDays: Number.NaN }),
    ).toThrow(/retentionDays/);
  });
});

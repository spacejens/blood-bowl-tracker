import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AdvisoryLockService,
  LOCK_CLASS_ID,
  LOCK_OBJECT_ID,
  LOCK_SQL,
} from './advisory-lock.service';
import {
  createLockSqlMock,
  type LockSqlMock,
} from './lock-sql-mock.test-helpers';

describe('AdvisoryLockService', () => {
  let sqlMock: LockSqlMock;
  let service: AdvisoryLockService;

  beforeEach(async () => {
    sqlMock = createLockSqlMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvisoryLockService,
        { provide: LOCK_SQL, useValue: sqlMock.sql },
      ],
    }).compile();
    service = moduleRef.get(AdvisoryLockService);
  });

  it('reserves a connection and reports acquisition', async () => {
    sqlMock.queueRows([{ acquired: true }]);

    await expect(service.tryAcquire()).resolves.toBe(true);
    expect(sqlMock.reserve).toHaveBeenCalledTimes(1);
    expect(sqlMock.queries[0]).toContain('pg_try_advisory_lock');
    expect(sqlMock.values[0]).toEqual([LOCK_CLASS_ID, LOCK_OBJECT_ID]);
    expect(sqlMock.release).not.toHaveBeenCalled();
  });

  it('releases the reservation when another machine holds the lock', async () => {
    sqlMock.queueRows([{ acquired: false }]);

    await expect(service.tryAcquire()).resolves.toBe(false);
    expect(sqlMock.release).toHaveBeenCalledTimes(1);
  });

  it('reserves a fresh connection on each attempt', async () => {
    sqlMock.queueRows([{ acquired: false }]);
    await service.tryAcquire();
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();

    expect(sqlMock.reserve).toHaveBeenCalledTimes(2);
  });

  it('returns false when reserving the connection fails', async () => {
    sqlMock.reserveFails(new Error('connection refused'));

    await expect(service.tryAcquire()).resolves.toBe(false);
  });

  it('returns false and releases when the lock query throws', async () => {
    sqlMock.queriesFail(new Error('server closed the connection'));

    await expect(service.tryAcquire()).resolves.toBe(false);
    expect(sqlMock.release).toHaveBeenCalledTimes(1);
  });

  it('returns false without throwing when the fallback release throws', async () => {
    sqlMock.queueRows([{ acquired: false }]);
    sqlMock.release.mockImplementation(() => {
      throw new Error('release failed');
    });

    await expect(service.tryAcquire()).resolves.toBe(false);
  });

  it('confirms the lock is still held on the reserved connection', async () => {
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();
    sqlMock.queueRows([{ held: 1 }]);

    await expect(service.isStillHeld()).resolves.toBe(true);
    expect(sqlMock.queries[1]).toContain('pg_locks');
  });

  it('reports the lock lost when the session no longer holds it', async () => {
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();
    sqlMock.queueRows([{ held: 0 }]);

    await expect(service.isStillHeld()).resolves.toBe(false);
  });

  it('reports the lock lost when the health query throws', async () => {
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();
    sqlMock.queriesFail(new Error('connection terminated'));

    await expect(service.isStillHeld()).resolves.toBe(false);
  });

  it('reports the lock lost when it was never acquired', async () => {
    await expect(service.isStillHeld()).resolves.toBe(false);
  });

  it('releases the reserved connection', async () => {
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();

    await service.release();

    expect(sqlMock.release).toHaveBeenCalledTimes(1);
    await expect(service.isStillHeld()).resolves.toBe(false);
  });

  it('resolves without throwing when release() itself throws', async () => {
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();
    sqlMock.release.mockImplementation(() => {
      throw new Error('release failed');
    });

    await expect(service.release()).resolves.toBeUndefined();
  });

  it('is a no-op to release when nothing was acquired', async () => {
    await expect(service.release()).resolves.toBeUndefined();
    expect(sqlMock.release).not.toHaveBeenCalled();
  });

  it('closes the client on module destroy', async () => {
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();

    await service.onModuleDestroy();

    expect(sqlMock.release).toHaveBeenCalledTimes(1);
    expect(sqlMock.end).toHaveBeenCalledTimes(1);
  });
});

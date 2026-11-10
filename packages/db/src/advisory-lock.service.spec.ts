import { ErrorLogService } from '@blood-bowl-tracker/logging';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

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
  let errorLog: MockProxy<ErrorLogService>;
  let service: AdvisoryLockService;

  beforeEach(async () => {
    sqlMock = createLockSqlMock();
    errorLog = mock<ErrorLogService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvisoryLockService,
        { provide: LOCK_SQL, useValue: sqlMock.sql },
        { provide: ErrorLogService, useValue: errorLog },
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
    const refused = new Error('connection refused');
    sqlMock.reserveFails(refused);

    await expect(service.tryAcquire()).resolves.toBe(false);
    expect(errorLog.logWarn).toHaveBeenCalledWith(
      expect.any(Logger),
      'Failed to reserve the advisory-lock connection',
      refused,
    );
  });

  it('returns false and releases when the lock query throws', async () => {
    const closed = new Error('server closed the connection');
    sqlMock.queriesFail(closed);

    await expect(service.tryAcquire()).resolves.toBe(false);
    expect(sqlMock.release).toHaveBeenCalledTimes(1);
    expect(errorLog.logWarn).toHaveBeenCalledWith(
      expect.any(Logger),
      'Advisory lock query failed',
      closed,
    );
  });

  it('returns false without throwing when the fallback release throws', async () => {
    sqlMock.queueRows([{ acquired: false }]);
    const releaseFailed = new Error('release failed');
    sqlMock.release.mockImplementation(() => {
      throw releaseFailed;
    });

    await expect(service.tryAcquire()).resolves.toBe(false);
    expect(errorLog.logWarn).toHaveBeenCalledWith(
      expect.any(Logger),
      'Failed to release the advisory-lock connection',
      releaseFailed,
    );
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
    const terminated = new Error('connection terminated');
    sqlMock.queriesFail(terminated);

    await expect(service.isStillHeld()).resolves.toBe(false);
    expect(errorLog.logWarn).toHaveBeenCalledWith(
      expect.any(Logger),
      'Advisory lock health check failed',
      terminated,
    );
  });

  it('reports the lock lost when it was never acquired', async () => {
    await expect(service.isStillHeld()).resolves.toBe(false);
  });

  it('unlocks on the reserved connection before releasing it', async () => {
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();

    // Records how many queries had already run by the time `release()` was
    // called on the connection — proves the ORDER, not just that both
    // happened. Releasing first would let a `max: 1` pool hand the same
    // connection to the next reserve() while still holding the lock, so
    // this must be 2 (the acquire query plus the unlock query), never 1.
    let queryCountAtRelease = -1;
    sqlMock.release.mockImplementation(() => {
      queryCountAtRelease = sqlMock.queries.length;
    });

    await service.release();

    expect(sqlMock.queries[1]).toContain('pg_advisory_unlock');
    expect(sqlMock.values[1]).toEqual([LOCK_CLASS_ID, LOCK_OBJECT_ID]);
    expect(queryCountAtRelease).toBe(2);
    expect(sqlMock.release).toHaveBeenCalledTimes(1);
    await expect(service.isStillHeld()).resolves.toBe(false);
  });

  it('still releases the connection when the unlock query throws', async () => {
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();
    const terminated = new Error('connection terminated');
    sqlMock.queriesFail(terminated);

    await expect(service.release()).resolves.toBeUndefined();
    expect(sqlMock.release).toHaveBeenCalledTimes(1);
    expect(errorLog.logWarn).toHaveBeenCalledWith(
      expect.any(Logger),
      'Failed to unlock the advisory lock',
      terminated,
    );
  });

  it('resolves without throwing when release() itself throws', async () => {
    sqlMock.queueRows([{ acquired: true }]);
    await service.tryAcquire();
    const releaseFailed = new Error('release failed');
    sqlMock.release.mockImplementation(() => {
      throw releaseFailed;
    });

    await expect(service.release()).resolves.toBeUndefined();
    expect(errorLog.logWarn).toHaveBeenCalledWith(
      expect.any(Logger),
      'Failed to release the advisory-lock connection',
      releaseFailed,
    );
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

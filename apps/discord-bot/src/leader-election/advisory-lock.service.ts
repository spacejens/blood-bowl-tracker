import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ReservedSql, Sql } from 'postgres';

/** DI token for the dedicated (non-drizzle) postgres.js client. */
export const LOCK_SQL = Symbol('LOCK_SQL');

/**
 * The two halves of the advisory lock key. Arbitrary but fixed: every machine
 * of this app must use the same pair, and nothing else in this database uses
 * advisory locks at all.
 */
export const LOCK_CLASS_ID = 4242;
export const LOCK_OBJECT_ID = 1;

/**
 * Holds the leader-election advisory lock on one dedicated, long-lived
 * connection.
 *
 * Advisory locks are session-scoped, so the lock must live on a specific
 * physical connection — drizzle's pooled client could run the acquire and the
 * release on two different connections. `sql.reserve()` gives us that one
 * connection; dropping it (crash, kill, network loss) makes Postgres release
 * the lock immediately, which is what gives failover for free with no
 * heartbeat or TTL bookkeeping.
 */
@Injectable()
export class AdvisoryLockService implements OnModuleDestroy {
  private readonly logger = new Logger(AdvisoryLockService.name);
  private reserved?: ReservedSql;

  constructor(@Inject(LOCK_SQL) private readonly sql: Sql) {}

  /** True when this instance now holds the lock. Never throws. */
  async tryAcquire(): Promise<boolean> {
    let reserved: ReservedSql;
    try {
      reserved = await this.sql.reserve();
    } catch (error) {
      this.logger.warn('Failed to reserve the advisory-lock connection', error);
      return false;
    }
    try {
      const rows = await reserved<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_lock(${LOCK_CLASS_ID}, ${LOCK_OBJECT_ID}) AS acquired
      `;
      if (rows[0]?.acquired === true) {
        this.reserved = reserved;
        return true;
      }
    } catch (error) {
      this.logger.warn('Advisory lock query failed', error);
    }
    try {
      reserved.release();
    } catch (error) {
      this.logger.warn('Failed to release the advisory-lock connection', error);
    }
    return false;
  }

  /**
   * Whether this session still holds the lock. False on any error — the caller
   * treats that as fatal, so an ambiguous answer must never read as "yes".
   */
  async isStillHeld(): Promise<boolean> {
    if (!this.reserved) {
      return false;
    }
    try {
      const rows = await this.reserved<{ held: number }[]>`
        SELECT count(*)::int AS held
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND classid = ${LOCK_CLASS_ID}
          AND objid = ${LOCK_OBJECT_ID}
          AND pid = pg_backend_pid()
      `;
      return Number(rows[0]?.held ?? 0) > 0;
    } catch (error) {
      this.logger.warn('Advisory lock health check failed', error);
      return false;
    }
  }

  /**
   * Releases the lock so a standby can take over, then returns the reserved
   * connection to the pool. Safe to call when nothing is held.
   *
   * `reserved.release()` alone is NOT enough: it only returns the connection
   * object to `postgres.js`'s pool, it does not close the underlying
   * connection or end the Postgres session — and an advisory lock is
   * session-scoped, held until `pg_advisory_unlock` runs or the session ends.
   * With `max: 1`, the very next `reserve()` hands back this same physical
   * connection, so without an explicit unlock this machine would silently
   * keep the lock across "releases" (`pg_try_advisory_lock` on an
   * already-held session just re-increments its hold count) and a standby
   * could never take over.
   */
  async release(): Promise<void> {
    const reserved = this.reserved;
    this.reserved = undefined;
    if (!reserved) {
      return;
    }
    try {
      await reserved`
        SELECT pg_advisory_unlock(${LOCK_CLASS_ID}, ${LOCK_OBJECT_ID})
      `;
    } catch (error) {
      this.logger.warn('Failed to unlock the advisory lock', error);
    }
    try {
      reserved.release();
    } catch (error) {
      this.logger.warn('Failed to release the advisory-lock connection', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.release();
    await this.sql.end();
  }
}

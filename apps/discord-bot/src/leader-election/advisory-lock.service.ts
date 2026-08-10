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
    reserved.release();
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
   * Releases the lock by dropping the reserved connection, so a standby can
   * take over. Safe to call when nothing is held.
   */
  release(): Promise<void> {
    const reserved = this.reserved;
    this.reserved = undefined;
    reserved?.release();
    return Promise.resolve();
  }

  async onModuleDestroy(): Promise<void> {
    await this.release();
    await this.sql.end();
  }
}

import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOCK_CLASS_ID, LOCK_OBJECT_ID } from './advisory-lock.service';
import { createDb } from './db';

interface StartupMocks {
  /** Ordered log of lock-client queries, `execute`, `migrate` and `end`. */
  events: string[];
  /** Values interpolated into each lock-client query, in order. */
  lockValues: unknown[][];
  /** Lock-client queries whose text contains the key reject with the value. */
  failingQueries: Map<string, Error>;
  poolClient: object;
  db: { execute: Mock<() => Promise<unknown[]>> };
  postgres: Mock<(url: string, options?: { max?: number }) => unknown>;
  drizzle: Mock<(config: { client: unknown }) => unknown>;
  migrate: Mock<
    (db: unknown, config: { migrationsFolder: string }) => Promise<void>
  >;
  lockEnd: Mock<() => Promise<void>>;
}

const startup = vi.hoisted(() => {
  const state: { current?: StartupMocks } = {};
  return {
    state,
    get: (): StartupMocks => {
      if (!state.current) {
        throw new Error('createStartupMocks() was not installed for this test');
      }
      return state.current;
    },
  };
});

vi.mock('postgres', () => ({
  default: (url: string, options?: { max?: number }) =>
    startup.get().postgres(url, options),
}));
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: (config: { client: unknown }) => startup.get().drizzle(config),
}));
vi.mock('drizzle-orm/postgres-js/migrator', () => ({
  migrate: (db: unknown, config: { migrationsFolder: string }) =>
    startup.get().migrate(db, config),
}));

const URL = 'postgres://user:pass@localhost:5432/bbt';
const LOCK_QUERY = 'query: SELECT pg_advisory_lock(?, ?)';
const UNLOCK_QUERY = 'query: SELECT pg_advisory_unlock(?, ?)';
const MIGRATION_LOCK_KEY = [4242, 2];
const KNOWN_MIGRATION = '20261102124542_confirm_bbl_advancement_order';

function createStartupMocks(): StartupMocks {
  const events: string[] = [];
  const lockValues: unknown[][] = [];
  const failingQueries = new Map<string, Error>();

  const lockQuery = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    events.push(`query: ${text}`);
    lockValues.push(values);
    for (const [fragment, error] of failingQueries) {
      if (text.includes(fragment)) return Promise.reject(error);
    }
    return Promise.resolve([]);
  };
  const lockEnd = vi.fn(() => {
    events.push('end');
    return Promise.resolve();
  });
  const lockClient = Object.assign(lockQuery, { end: lockEnd });
  const poolClient = { kind: 'pool' };
  const db = {
    execute: vi.fn(() => {
      events.push('execute');
      return Promise.resolve<unknown[]>([]);
    }),
  };

  return {
    events,
    lockValues,
    failingQueries,
    poolClient,
    db,
    lockEnd,
    postgres: vi.fn((_url: string, options?: { max?: number }) =>
      options?.max === 1 ? lockClient : poolClient,
    ),
    drizzle: vi.fn(() => db),
    migrate: vi.fn(() => {
      events.push('migrate');
      return Promise.resolve();
    }),
  };
}

describe('createDb', () => {
  let mocks: StartupMocks;

  beforeEach(() => {
    mocks = createStartupMocks();
    startup.state.current = mocks;
  });

  afterEach(() => {
    startup.state.current = undefined;
  });

  it('takes the migration lock before migrating and releases it after', async () => {
    await createDb(URL);

    expect(mocks.events).toEqual([LOCK_QUERY, 'migrate', UNLOCK_QUERY, 'end']);
  });

  it('returns the drizzle instance built on the pooled client', async () => {
    const db = await createDb(URL);

    expect(db).toBe(mocks.db);
    expect(mocks.drizzle).toHaveBeenCalledWith({ client: mocks.poolClient });
    expect(mocks.migrate).toHaveBeenCalledWith(mocks.db, {
      migrationsFolder: expect.stringMatching(/migrations$/) as unknown,
    });
  });

  it('holds the lock on its own single-connection client', async () => {
    await createDb(URL);

    expect(mocks.postgres).toHaveBeenCalledWith(URL, { max: 1 });
    expect(mocks.postgres).toHaveBeenCalledWith(URL, undefined);
  });

  it('acquires and releases the same migration lock key', async () => {
    await createDb(URL);

    expect(mocks.lockValues).toEqual([MIGRATION_LOCK_KEY, MIGRATION_LOCK_KEY]);
  });

  it('uses a lock key different from the leader-election lock', async () => {
    await createDb(URL);

    expect(mocks.lockValues[0]).not.toEqual([LOCK_CLASS_ID, LOCK_OBJECT_ID]);
  });

  it('releases the lock and propagates the error when migrate throws', async () => {
    const failure = new Error('migration failed');
    mocks.migrate.mockImplementation(() => {
      mocks.events.push('migrate');
      return Promise.reject(failure);
    });

    await expect(createDb(URL)).rejects.toBe(failure);
    expect(mocks.events).toEqual([LOCK_QUERY, 'migrate', UNLOCK_QUERY, 'end']);
  });

  it('closes the lock client without migrating when the lock cannot be taken', async () => {
    const failure = new Error('connection refused');
    mocks.failingQueries.set('pg_advisory_lock', failure);

    await expect(createDb(URL)).rejects.toBe(failure);
    expect(mocks.migrate).not.toHaveBeenCalled();
    expect(mocks.events).toEqual([LOCK_QUERY, 'end']);
  });

  it('still succeeds and closes the lock client when unlocking fails', async () => {
    mocks.failingQueries.set('pg_advisory_unlock', new Error('unlock failed'));

    await expect(createDb(URL)).resolves.toBe(mocks.db);
    expect(mocks.lockEnd).toHaveBeenCalledTimes(1);
  });

  it('keeps the migration error when unlocking also fails', async () => {
    const failure = new Error('migration failed');
    mocks.migrate.mockRejectedValue(failure);
    mocks.failingQueries.set('pg_advisory_unlock', new Error('unlock failed'));

    await expect(createDb(URL)).rejects.toBe(failure);
    expect(mocks.lockEnd).toHaveBeenCalledTimes(1);
  });

  it('logs pending migrations while holding the lock', async () => {
    const log = vi.fn();

    await createDb(URL, log);

    expect(mocks.events).toEqual([
      LOCK_QUERY,
      'execute',
      'migrate',
      UNLOCK_QUERY,
      'end',
    ]);
    expect(log).toHaveBeenCalledWith(`Applying: ${KNOWN_MIGRATION}`);
  });

  it('does not log migrations the tracking table already lists', async () => {
    const log = vi.fn();
    mocks.db.execute.mockResolvedValue([
      { name: KNOWN_MIGRATION },
      { name: 42 },
    ]);

    await createDb(URL, log);

    expect(log).not.toHaveBeenCalledWith(`Applying: ${KNOWN_MIGRATION}`);
  });

  it('logs every local migration when the tracking table does not exist yet', async () => {
    const log = vi.fn();
    mocks.db.execute.mockRejectedValue(new Error('relation does not exist'));

    await createDb(URL, log);

    expect(log).toHaveBeenCalledWith(`Applying: ${KNOWN_MIGRATION}`);
    expect(mocks.migrate).toHaveBeenCalledTimes(1);
  });
});

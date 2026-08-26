import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { teamEras } from '../schema/team-eras.js';
import { mockDb } from './db-mock.test-helpers.js';

type Chainable = Record<string, (...args: unknown[]) => Chainable> &
  PromiseLike<unknown>;

describe('mockDb', () => {
  it('resolves a select chain to the configured rows', async () => {
    const { db } = mockDb([{ id: 1 }]);
    const rows = await (db as never as { select: () => Chainable })
      .select()
      .from({})
      .where(eq);
    expect(rows).toEqual([{ id: 1 }]);
  });

  it('chains every builder method and stays awaitable at the end', async () => {
    const { db, chains } = mockDb([{ id: 2 }]);
    const q = (db as never as { select: () => Chainable }).select();
    const rows = await q
      .from({})
      .innerJoin({}, {})
      .where({})
      .groupBy({})
      .orderBy({})
      .limit(5);
    expect(rows).toEqual([{ id: 2 }]);
    expect(chains).toHaveLength(1);
    expect(chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('gives each successive query its own chain and rows', async () => {
    const { db, chains } = mockDb([{ id: 1 }], [{ id: 2 }]);
    const d = db as never as { select: () => Chainable };
    const first = await d.select().from({}).where('a');
    const second = await d.select().from({}).where('b');
    expect(first).toEqual([{ id: 1 }]);
    expect(second).toEqual([{ id: 2 }]);
    expect(chains).toHaveLength(2);
    expect(chains[0].where.mock.calls[0][0]).toBe('a');
    expect(chains[1].where.mock.calls[0][0]).toBe('b');
  });

  it('resolves to an empty array when no rows are configured for a query', async () => {
    const { db } = mockDb();
    const rows = await (db as never as { select: () => Chainable })
      .select()
      .from({});
    expect(rows).toEqual([]);
  });

  it('supports insert/values/onConflictDoUpdate/returning write chains', async () => {
    const { db, chains } = mockDb([{ id: 3 }]);
    const d = db as never as { insert: (t: unknown) => Chainable };
    const rows = await d
      .insert({})
      .values({ name: 'Griff' })
      .onConflictDoUpdate({ target: 'id' })
      .returning();
    expect(rows).toEqual([{ id: 3 }]);
    expect(chains[0].values).toHaveBeenCalledWith({ name: 'Griff' });
  });

  it('supports update/set/where/returning write chains', async () => {
    const { db, chains } = mockDb([{ id: 4 }]);
    const d = db as never as { update: (t: unknown) => Chainable };
    const rows = await d
      .update({})
      .set({ name: 'Griff' })
      .where('cond')
      .returning();
    expect(rows).toEqual([{ id: 4 }]);
    expect(chains[0].set).toHaveBeenCalledWith({ name: 'Griff' });
  });

  it('supports delete chains', async () => {
    const { db, chains } = mockDb([]);
    await (db as never as { delete: (t: unknown) => Chainable })
      .delete({})
      .where('gone');
    expect(chains[0].where.mock.calls[0][0]).toBe('gone');
  });

  it('captures real drizzle conditions unmodified for specs to introspect', async () => {
    const { db, chains } = mockDb([]);
    // A real drizzle Column is used here (not a plain object) so the captured
    // value is the same shape service specs assert against.
    // @ts-expect-error - drizzle-orm types conflict with nodenext ESM resolution
    const condition = and(eq(teamEras.eraId, 42));
    await (db as never as { select: () => Chainable })
      .select()
      .from({})
      .where(condition);
    expect(chains[0].where.mock.calls[0][0]).toBe(condition);
  });

  it('records the table passed to from() on the chain', async () => {
    const { db, chains } = mockDb([{ id: 1 }]);
    const table = { name: 'coaches' };
    await (db as never as { select: () => Chainable }).select().from(table);
    expect(chains[0].from).toHaveBeenCalledWith(table);
  });

  it('runs a transaction callback with the same mock db and records its queries', async () => {
    const { db, chains, transaction } = mockDb([{ id: 7 }]);
    const d = db as never as {
      transaction: (cb: (tx: unknown) => unknown) => Promise<unknown>;
    };
    const result = await d.transaction(
      async (tx) =>
        await (tx as { select: () => Chainable })
          .select()
          .from({})
          .where('inside'),
    );
    expect(result).toEqual([{ id: 7 }]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(chains).toHaveLength(1);
    expect(chains[0].where.mock.calls[0][0]).toBe('inside');
  });

  it('lets a spec simulate a failing transaction', async () => {
    const { db, transaction } = mockDb();
    transaction.mockRejectedValue(new Error('rolled back'));
    const d = db as never as {
      transaction: (cb: (tx: unknown) => unknown) => Promise<unknown>;
    };
    await expect(d.transaction(vi.fn())).rejects.toThrow('rolled back');
  });
});

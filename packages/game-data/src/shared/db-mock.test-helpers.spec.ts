import { teamEras } from '@blood-bowl-tracker/db';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { mockDb } from './db-mock.test-helpers';
import {
  extractFilterValues,
  firstCallArg,
} from './query-assertions.test-helpers';

describe('mockDb', () => {
  it('resolves a select chain to the configured rows', async () => {
    const { db } = mockDb([{ id: 1 }]);
    const rows = await (
      db as never as {
        select: () => {
          from: (t: unknown) => {
            where: (c: unknown) => Promise<{ id: number }[]>;
          };
        };
      }
    )
      .select()
      .from({})
      .where(eq);
    expect(rows).toEqual([{ id: 1 }]);
  });

  it('chains every builder method and stays awaitable at the end', async () => {
    const { db, chains } = mockDb([{ id: 2 }]);
    type Chainable = Record<string, (...args: unknown[]) => Chainable> &
      PromiseLike<unknown>;
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
    type Chainable = Record<string, (...args: unknown[]) => Chainable> &
      PromiseLike<unknown>;
    const d = db as never as { select: () => Chainable };
    const first = await d.select().from({}).where('a');
    const second = await d.select().from({}).where('b');
    expect(first).toEqual([{ id: 1 }]);
    expect(second).toEqual([{ id: 2 }]);
    expect(chains).toHaveLength(2);
    expect(firstCallArg(chains[0].where)).toBe('a');
    expect(firstCallArg(chains[1].where)).toBe('b');
  });

  it('resolves to an empty array when no rows are configured for a query', async () => {
    const { db } = mockDb();
    type Chainable = Record<string, (...args: unknown[]) => Chainable> &
      PromiseLike<unknown>;
    const rows = await (db as never as { select: () => Chainable })
      .select()
      .from({});
    expect(rows).toEqual([]);
  });

  it('supports insert/values/onConflictDoUpdate/returning write chains', async () => {
    const { db, chains } = mockDb([{ id: 3 }]);
    type Chainable = Record<string, (...args: unknown[]) => Chainable> &
      PromiseLike<unknown>;
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
    type Chainable = Record<string, (...args: unknown[]) => Chainable> &
      PromiseLike<unknown>;
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
    type Chainable = Record<string, (...args: unknown[]) => Chainable> &
      PromiseLike<unknown>;
    await (db as never as { delete: (t: unknown) => Chainable })
      .delete({})
      .where('gone');
    expect(firstCallArg(chains[0].where)).toBe('gone');
  });

  it('captures real drizzle conditions for query-assertions helpers to introspect', async () => {
    const { db, chains } = mockDb([]);
    type Chainable = Record<string, (...args: unknown[]) => Chainable> &
      PromiseLike<unknown>;
    // A real drizzle Column is required here (not a plain object): eq() only
    // wraps its right-hand value in a Param -- what extractFilterValues reads
    // -- when it recognizes the left-hand side as an actual Column instance.
    const condition = and(eq(teamEras.eraId, 42));
    await (db as never as { select: () => Chainable })
      .select()
      .from({})
      .where(condition);
    expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(42);
  });

  it('records the table passed to from() on the chain', async () => {
    const { db, chains } = mockDb([{ id: 1 }]);
    type Chainable = Record<string, (...args: unknown[]) => Chainable> &
      PromiseLike<unknown>;
    const table = { name: 'coaches' };
    await (db as never as { select: () => Chainable }).select().from(table);
    expect(chains[0].from).toHaveBeenCalledWith(table);
  });
});

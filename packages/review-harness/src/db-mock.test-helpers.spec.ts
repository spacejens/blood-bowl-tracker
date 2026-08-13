import { describe, expect, it } from 'vitest';

import { mockDb } from './db-mock.test-helpers';

type Chainable = Record<string, (...args: unknown[]) => Chainable> &
  PromiseLike<unknown>;

describe('mockDb', () => {
  it('resolves a select chain to the configured rows', async () => {
    const { db } = mockDb([{ id: 1 }]);

    const rows = await (db as never as { select: () => Chainable })
      .select()
      .from({})
      .where({});

    expect(rows).toEqual([{ id: 1 }]);
  });

  it('gives each query its own chain and its own row set', async () => {
    const { db, chains } = mockDb([{ id: 1 }], [{ id: 2 }]);
    const query = (db as never as { select: () => Chainable }).select;

    await expect(query().from({})).resolves.toEqual([{ id: 1 }]);
    await expect(query().from({})).resolves.toEqual([{ id: 2 }]);
    expect(chains).toHaveLength(2);
  });

  it('resolves to an empty array when fewer row sets than queries are supplied', async () => {
    const { db } = mockDb();

    await expect(
      (db as never as { select: () => Chainable }).select().from({}),
    ).resolves.toEqual([]);
  });

  it('captures the arguments each builder method was called with', async () => {
    const { db, chains } = mockDb([{ id: 1 }]);
    const condition = { column: 'id' };

    await (db as never as { select: () => Chainable })
      .select()
      .from({})
      .where(condition);

    expect(chains[0].where.mock.calls[0][0]).toBe(condition);
  });
});

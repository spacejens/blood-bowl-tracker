import type { Db } from '@blood-bowl-tracker/db';
import type { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { countRows } from './count-all';

describe('countRows', () => {
  it('returns the count from the first row of the count query', async () => {
    const from = vi.fn().mockResolvedValue([{ count: 42 }]);
    const db = { select: vi.fn(() => ({ from })) } as unknown as Db;
    await expect(countRows(db, {} as PgTable)).resolves.toBe(42);
    expect(from).toHaveBeenCalledTimes(1);
  });
});

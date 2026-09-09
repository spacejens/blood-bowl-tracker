import { eq, guilds } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { describe, expect, it } from 'vitest';

import { selectThenUpsert } from './select-then-upsert';

describe('selectThenUpsert', () => {
  it('inserts and returns the new id when no row matches the condition', async () => {
    // Query 0: the select (finds nothing). Query 1: the insert.
    const db = mockDb([], [{ id: 7 }]);

    const id = await selectThenUpsert({
      tx: db.db,
      table: guilds,
      idColumn: guilds.id,
      where: eq(guilds.discordId, 'g1'),
      values: { discordId: 'g1', name: 'The Pitch' },
    });

    expect(id).toBe(7);
    expect(db.chains).toHaveLength(2);
    expect(db.chains[1].values.mock.calls[0][0]).toEqual({
      discordId: 'g1',
      name: 'The Pitch',
    });
  });

  it('updates and returns the existing id when a row already matches the condition', async () => {
    // Query 0: the select (finds the row). Query 1: the update.
    const db = mockDb([{ id: 7 }], []);

    const id = await selectThenUpsert({
      tx: db.db,
      table: guilds,
      idColumn: guilds.id,
      where: eq(guilds.discordId, 'g1'),
      values: { discordId: 'g1', name: 'Renamed' },
    });

    expect(id).toBe(7);
    expect(db.chains).toHaveLength(2);
    expect(db.chains[1].set.mock.calls[0][0]).toEqual({
      discordId: 'g1',
      name: 'Renamed',
    });
  });

  it('never issues an ON CONFLICT clause on either path', async () => {
    const insertDb = mockDb([], [{ id: 1 }]);
    await selectThenUpsert({
      tx: insertDb.db,
      table: guilds,
      idColumn: guilds.id,
      where: eq(guilds.discordId, 'g1'),
      values: { discordId: 'g1', name: 'The Pitch' },
    });
    expect(insertDb.chains[1].onConflictDoUpdate).not.toHaveBeenCalled();

    const updateDb = mockDb([{ id: 1 }], []);
    await selectThenUpsert({
      tx: updateDb.db,
      table: guilds,
      idColumn: guilds.id,
      where: eq(guilds.discordId, 'g1'),
      values: { discordId: 'g1', name: 'The Pitch' },
    });
    expect(updateDb.chains[0].onConflictDoUpdate).not.toHaveBeenCalled();
  });
});

import { eq, guilds } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { describe, expect, it } from 'vitest';

import { selectThenUpsert } from './select-then-upsert';

/** A PostgresError-shaped unique-constraint violation on `guilds`. */
function guildsUniqueViolation(): Error {
  return Object.assign(new Error('duplicate key value'), {
    code: '23505',
    table_name: 'guilds',
    constraint_name: 'guilds_discord_id_key',
  });
}

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

  it('re-reads and returns the winner id when a concurrent insert wins the unique-constraint race', async () => {
    // Query 0: the select (finds nothing). Query 1: the insert, which loses
    // the race and rejects with a unique-constraint violation on this table.
    // Query 2: the re-select, which finds the winner.
    const db = mockDb([], guildsUniqueViolation(), [{ id: 99 }]);

    const id = await selectThenUpsert({
      tx: db.db,
      table: guilds,
      idColumn: guilds.id,
      where: eq(guilds.discordId, 'g1'),
      values: { discordId: 'g1', name: 'The Pitch' },
    });

    expect(id).toBe(99);
  });

  it('rethrows the original error when a unique violation fires but no row appears on re-select', async () => {
    const insertError = guildsUniqueViolation();
    const db = mockDb([], insertError, []);

    await expect(
      selectThenUpsert({
        tx: db.db,
        table: guilds,
        idColumn: guilds.id,
        where: eq(guilds.discordId, 'g1'),
        values: { discordId: 'g1', name: 'The Pitch' },
      }),
    ).rejects.toBe(insertError);
  });

  it('rethrows immediately without re-selecting when the insert error is not a unique violation on this table', async () => {
    // Query 0: the select (finds nothing). Query 1: the insert, which fails
    // for an unrelated reason (here: a plain connection error with no
    // Postgres error code at all).
    const insertError = new Error('connection reset');
    const db = mockDb([], insertError);

    await expect(
      selectThenUpsert({
        tx: db.db,
        table: guilds,
        idColumn: guilds.id,
        where: eq(guilds.discordId, 'g1'),
        values: { discordId: 'g1', name: 'The Pitch' },
      }),
    ).rejects.toBe(insertError);
    // No re-select was issued: the failure was recognized as unrelated to
    // the concurrent-insert race before ever touching `where` again.
    expect(db.chains).toHaveLength(2);
  });

  it('rethrows immediately when the violated constraint belongs to a different table', async () => {
    const insertError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      table_name: 'channels',
      constraint_name: 'channels_discord_id_key',
    });
    const db = mockDb([], insertError);

    await expect(
      selectThenUpsert({
        tx: db.db,
        table: guilds,
        idColumn: guilds.id,
        where: eq(guilds.discordId, 'g1'),
        values: { discordId: 'g1', name: 'The Pitch' },
      }),
    ).rejects.toBe(insertError);
    expect(db.chains).toHaveLength(2);
  });

  it('recognizes a unique violation wrapped one level deep in .cause, matching drizzle-orm', async () => {
    // drizzle-orm wraps the driver's PostgresError in a DrizzleQueryError,
    // exposed only via `.cause`.
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: guildsUniqueViolation(),
    });
    const db = mockDb([], wrapped, [{ id: 99 }]);

    const id = await selectThenUpsert({
      tx: db.db,
      table: guilds,
      idColumn: guilds.id,
      where: eq(guilds.discordId, 'g1'),
      values: { discordId: 'g1', name: 'The Pitch' },
    });

    expect(id).toBe(99);
  });

  it('rethrows immediately when the violated constraint is the primary key', async () => {
    const insertError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      table_name: 'guilds',
      constraint_name: 'guilds_pkey',
    });
    const db = mockDb([], insertError);

    await expect(
      selectThenUpsert({
        tx: db.db,
        table: guilds,
        idColumn: guilds.id,
        where: eq(guilds.discordId, 'g1'),
        values: { discordId: 'g1', name: 'The Pitch' },
      }),
    ).rejects.toBe(insertError);
    expect(db.chains).toHaveLength(2);
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

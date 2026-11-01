/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  coaches,
  eras,
  leagues,
  playerAdvancements,
  playerAdvancementsHistory,
  players,
  positions,
  races,
  skills,
  sql,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connectTestDb } from './e2e-database';

const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');
const COUNT_COLUMNS = [
  'move_increase_count',
  'strength_increase_count',
  'agility_increase_count',
  'passing_increase_count',
  'armour_increase_count',
];

/** The migration's backfill statement. */
function backfillStatement(): string {
  const folder = readdirSync(MIGRATIONS_DIR).find((name) =>
    name.endsWith('_move_characteristic_increases_to_advancements'),
  );
  if (folder === undefined) {
    throw new Error(
      'No move_characteristic_increases_to_advancements migration was found.',
    );
  }
  const statements = readFileSync(
    join(MIGRATIONS_DIR, folder, 'migration.sql'),
    'utf-8',
  )
    .split('--> statement-breakpoint')
    .filter((statement) =>
      statement.includes('INSERT INTO "game_data"."player_advancements"'),
    );
  if (statements.length !== 1) {
    throw new Error(
      `Expected one backfill statement, found ${statements.length}.`,
    );
  }
  return statements[0];
}

async function runBackfill(db: Db): Promise<void> {
  await db.execute(sql.raw(backfillStatement()));
}

/** Writes raw increase counts, which the schema no longer models. */
async function setCounts(
  db: Db,
  playerId: number,
  counts: Record<string, number>,
): Promise<void> {
  const assignments = Object.entries(counts)
    .map(([column, count]) => `"${column}" = ${count}`)
    .join(', ');
  await db.execute(
    sql.raw(
      `UPDATE "game_data"."players" SET ${assignments} WHERE "id" = ${playerId}`,
    ),
  );
}

interface Seeded {
  a: number;
  b: number;
}

/** Players A and B on one team, with no counts and no advancement rows. */
async function seed(db: Db): Promise<Seeded> {
  const [league] = await db.insert(leagues).values({ name: 'L' }).returning();
  const [era] = await db
    .insert(eras)
    .values({ name: 'E', leagueId: league.id, startDate: '2020-01-01' })
    .returning();
  const [coach] = await db.insert(coaches).values({ name: 'C' }).returning();
  const [race] = await db.insert(races).values({ name: 'R' }).returning();
  const [team] = await db
    .insert(teams)
    .values({ name: 'T', raceId: race.id, coachId: coach.id })
    .returning();
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId: team.id, eraId: era.id })
    .returning();
  const [position] = await db
    .insert(positions)
    .values({ name: 'P', isStarPlayer: false })
    .returning();
  const [a, b] = await db
    .insert(players)
    .values([
      { name: 'A', teamEraId: teamEra.id, positionId: position.id },
      { name: 'B', teamEraId: teamEra.id, positionId: position.id },
    ])
    .returning();
  return { a: a.id, b: b.id };
}

async function increaseRows(db: Db) {
  return await db
    .select({
      playerId: playerAdvancements.playerId,
      characteristic: playerAdvancements.characteristic,
      source: playerAdvancements.source,
      order: playerAdvancements.advancementOrder,
      confirmed: playerAdvancements.orderConfirmed,
      removed: playerAdvancements.removed,
    })
    .from(playerAdvancements)
    .orderBy(asc(playerAdvancements.id));
}

function unordered(playerId: number, characteristic: string) {
  return {
    playerId,
    characteristic,
    source: 'characteristic',
    order: null,
    confirmed: false,
    removed: false,
  };
}

describe('move_characteristic_increases_to_advancements backfill (real Postgres)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await connectTestDb();
    // The columns are gone once every migration has run. They come back for
    // this file only (players_history still has them, nullable) so the
    // backfill can run against seeded counts.
    for (const column of COUNT_COLUMNS) {
      await db.execute(
        sql.raw(
          `ALTER TABLE "game_data"."players" ADD COLUMN "${column}" integer NOT NULL DEFAULT 0`,
        ),
      );
    }
  });

  afterAll(async () => {
    for (const column of COUNT_COLUMNS) {
      await db.execute(
        sql.raw(`ALTER TABLE "game_data"."players" DROP COLUMN "${column}"`),
      );
    }
    await closeTestDb(db);
  });

  let ids: Seeded;

  beforeEach(async () => {
    await resetGameDataTables(db);
    ids = await seed(db);
  });

  it('writes one unordered, unconfirmed row per counted increase', async () => {
    await setCounts(db, ids.a, {
      armour_increase_count: 1,
      agility_increase_count: 2,
    });

    await runBackfill(db);

    expect(await increaseRows(db)).toEqual([
      unordered(ids.a, 'AG'),
      unordered(ids.a, 'AG'),
      unordered(ids.a, 'AV'),
    ]);
  });

  it('writes every characteristic, in characteristic order per player', async () => {
    await setCounts(db, ids.b, { move_increase_count: 1 });
    await setCounts(db, ids.a, {
      armour_increase_count: 1,
      passing_increase_count: 1,
      agility_increase_count: 1,
      strength_increase_count: 1,
      move_increase_count: 1,
    });

    await runBackfill(db);

    expect(await increaseRows(db)).toEqual([
      unordered(ids.a, 'MA'),
      unordered(ids.a, 'ST'),
      unordered(ids.a, 'AG'),
      unordered(ids.a, 'PA'),
      unordered(ids.a, 'AV'),
      unordered(ids.b, 'MA'),
    ]);
  });

  it('records each new row in the history table', async () => {
    await setCounts(db, ids.a, { agility_increase_count: 2 });

    await runBackfill(db);

    const stored = await db
      .select({ id: playerAdvancements.id })
      .from(playerAdvancements)
      .orderBy(asc(playerAdvancements.id));
    const history = await db.select().from(playerAdvancementsHistory);
    expect(
      history
        .map((row) => ({
          id: Number(row.id),
          characteristic: row.characteristic,
        }))
        .sort((x, y) => x.id - y.id),
    ).toEqual(stored.map(({ id }) => ({ id, characteristic: 'AG' })));
    expect(stored).toHaveLength(2);
  });

  it('skips a player who already has increase rows', async () => {
    await setCounts(db, ids.a, {
      agility_increase_count: 1,
      strength_increase_count: 1,
    });
    await db.insert(playerAdvancements).values({
      playerId: ids.a,
      source: 'characteristic',
      characteristic: 'AG',
      advancementOrder: 2,
      orderConfirmed: true,
    });

    await runBackfill(db);

    expect(await increaseRows(db)).toEqual([
      { ...unordered(ids.a, 'AG'), order: 2, confirmed: true },
    ]);
  });

  it('skips a player whose only increase rows are removed ones', async () => {
    await setCounts(db, ids.a, { agility_increase_count: 1 });
    await db.insert(playerAdvancements).values({
      playerId: ids.a,
      source: 'characteristic',
      characteristic: 'ST',
      removed: true,
    });

    await runBackfill(db);

    expect(await increaseRows(db)).toEqual([
      { ...unordered(ids.a, 'ST'), removed: true },
    ]);
  });

  it('backfills a player who has skill rows but no increase rows', async () => {
    await setCounts(db, ids.a, { move_increase_count: 1 });
    const [block] = await db
      .insert(skills)
      .values({ name: 'Block' })
      .returning();
    await db
      .insert(playerAdvancements)
      .values({ playerId: ids.a, skillId: block.id, source: 'advancement' });

    await runBackfill(db);

    const rows = await increaseRows(db);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(unordered(ids.a, 'MA'));
  });

  it('writes nothing for a player whose counts are all zero', async () => {
    await runBackfill(db);

    expect(await increaseRows(db)).toEqual([]);
  });

  it('changes nothing when run a second time', async () => {
    await setCounts(db, ids.a, {
      armour_increase_count: 1,
      agility_increase_count: 2,
    });

    await runBackfill(db);
    await runBackfill(db);

    expect(await increaseRows(db)).toEqual([
      unordered(ids.a, 'AG'),
      unordered(ids.a, 'AG'),
      unordered(ids.a, 'AV'),
    ]);
  });
});

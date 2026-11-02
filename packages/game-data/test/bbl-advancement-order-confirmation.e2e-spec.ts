/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  coaches,
  eras,
  externalSystems,
  leagues,
  playerAdvancements,
  playerAdvancementsHistory,
  playerExternalIds,
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

/** The migration's one statement. */
function migrationStatement(): string {
  const folder = readdirSync(MIGRATIONS_DIR).find((name) =>
    name.endsWith('_confirm_bbl_advancement_order'),
  );
  if (folder === undefined) {
    throw new Error('No confirm_bbl_advancement_order migration was found.');
  }
  return readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf-8');
}

async function runMigration(db: Db): Promise<void> {
  await db.execute(sql.raw(migrationStatement()));
}

interface Seeded {
  bblOnly: number;
  tpOnly: number;
  both: number;
  neither: number;
  skillId: number;
}

/** Four players on one team, identified by BBL, TP, both or neither. */
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
  const [bblOnly, tpOnly, both, neither] = await db
    .insert(players)
    .values(
      ['A', 'B', 'C', 'D'].map((name) => ({
        name,
        teamEraId: teamEra.id,
        positionId: position.id,
      })),
    )
    .returning();
  const [bbl, tp] = await db
    .insert(externalSystems)
    .values([
      { name: 'tloeg.bbleague.se', category: 'imported_data_source' },
      { name: 'tourplay.net', category: 'imported_data_source' },
    ])
    .returning();
  await db.insert(playerExternalIds).values([
    { playerId: bblOnly.id, externalSystemId: bbl.id, externalId: '1' },
    { playerId: tpOnly.id, externalSystemId: tp.id, externalId: '2' },
    { playerId: both.id, externalSystemId: bbl.id, externalId: '3' },
    { playerId: both.id, externalSystemId: tp.id, externalId: '4' },
  ]);
  const [skill] = await db.insert(skills).values({ name: 'Block' }).returning();
  return {
    bblOnly: bblOnly.id,
    tpOnly: tpOnly.id,
    both: both.id,
    neither: neither.id,
    skillId: skill.id,
  };
}

/** Each row's confirmation flag, in insertion order. */
async function confirmedFlags(db: Db): Promise<boolean[]> {
  const rows = await db
    .select({ confirmed: playerAdvancements.orderConfirmed })
    .from(playerAdvancements)
    .orderBy(asc(playerAdvancements.id));
  return rows.map((row) => row.confirmed);
}

/** Each row's order and confirmation flag, in insertion order. */
async function ordersAndFlags(db: Db): Promise<[number | null, boolean][]> {
  const rows = await db
    .select({
      order: playerAdvancements.advancementOrder,
      confirmed: playerAdvancements.orderConfirmed,
    })
    .from(playerAdvancements)
    .orderBy(asc(playerAdvancements.id));
  return rows.map((row) => [row.order, row.confirmed]);
}

/**
 * A BBL-only player's paid Block at 1, a free extra at `freeOrder`, a paid
 * skill at 3 and an increase at 4, numbered as BBL's page lists them.
 */
async function insertAroundFreeExtra(
  db: Db,
  ids: Seeded,
  freeOrder: number | null,
): Promise<void> {
  const [mutation, dodge] = await db
    .insert(skills)
    .values([{ name: 'Tentacles' }, { name: 'Dodge' }])
    .returning();
  await db.insert(playerAdvancements).values([
    {
      playerId: ids.bblOnly,
      skillId: ids.skillId,
      source: 'advancement',
      advancementOrder: 1,
    },
    {
      playerId: ids.bblOnly,
      skillId: mutation.id,
      source: 'advancement',
      advancementOrder: freeOrder,
      isFreeExtra: true,
    },
    {
      playerId: ids.bblOnly,
      skillId: dodge.id,
      source: 'advancement',
      advancementOrder: 3,
    },
    {
      playerId: ids.bblOnly,
      source: 'characteristic',
      characteristic: 'AG',
      advancementOrder: 4,
    },
  ]);
}

async function historyCount(db: Db): Promise<number> {
  return (await db.select().from(playerAdvancementsHistory)).length;
}

describe('confirm_bbl_advancement_order migration (real Postgres)', () => {
  let db: Db;
  let ids: Seeded;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    ids = await seed(db);
  });

  it("confirms a BBL-only player's numbered gained skill and increase", async () => {
    await db.insert(playerAdvancements).values([
      {
        playerId: ids.bblOnly,
        skillId: ids.skillId,
        source: 'advancement',
        advancementOrder: 1,
      },
      {
        playerId: ids.bblOnly,
        source: 'characteristic',
        characteristic: 'AG',
        advancementOrder: 2,
      },
    ]);

    await runMigration(db);

    expect(await confirmedFlags(db)).toEqual([true, true]);
  });

  it('leaves players with a TP external id, or no BBL one, alone', async () => {
    await db.insert(playerAdvancements).values(
      [ids.tpOnly, ids.both, ids.neither].map((playerId) => ({
        playerId,
        skillId: ids.skillId,
        source: 'chosen' as const,
        advancementOrder: 1,
      })),
    );

    await runMigration(db);

    expect(await confirmedFlags(db)).toEqual([false, false, false]);
  });

  it('leaves starting skills, free extras, unnumbered and removed rows alone', async () => {
    const [dodge, guard, hatred] = await db
      .insert(skills)
      .values([{ name: 'Dodge' }, { name: 'Guard' }, { name: 'Hatred' }])
      .returning();
    await db.insert(playerAdvancements).values([
      { playerId: ids.bblOnly, skillId: ids.skillId, source: 'starting' },
      {
        playerId: ids.bblOnly,
        skillId: hatred.id,
        source: 'advancement',
        advancementOrder: 1,
        isFreeExtra: true,
      },
      { playerId: ids.bblOnly, skillId: dodge.id, source: 'advancement' },
      {
        playerId: ids.bblOnly,
        source: 'characteristic',
        characteristic: 'ST',
        advancementOrder: 2,
        removed: true,
      },
      {
        playerId: ids.bblOnly,
        skillId: guard.id,
        source: 'advancement',
        advancementOrder: 3,
      },
    ]);

    await runMigration(db);

    expect(await confirmedFlags(db)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("closes a numbered free extra's slot in the confirmed paid numbering", async () => {
    await insertAroundFreeExtra(db, ids, 2);

    await runMigration(db);

    expect(await ordersAndFlags(db)).toEqual([
      [1, true],
      [2, false],
      [2, true],
      [3, true],
    ]);
  });

  it('closes the slots of two free extras of one player', async () => {
    const [mutation, twoHeads, dodge, guard] = await db
      .insert(skills)
      .values([
        { name: 'Tentacles' },
        { name: 'Two Heads' },
        { name: 'Dodge' },
        { name: 'Guard' },
      ])
      .returning();
    await db.insert(playerAdvancements).values([
      {
        playerId: ids.bblOnly,
        skillId: ids.skillId,
        source: 'advancement',
        advancementOrder: 1,
      },
      {
        playerId: ids.bblOnly,
        skillId: mutation.id,
        source: 'advancement',
        advancementOrder: 2,
        isFreeExtra: true,
      },
      {
        playerId: ids.bblOnly,
        skillId: dodge.id,
        source: 'advancement',
        advancementOrder: 3,
      },
      {
        playerId: ids.bblOnly,
        skillId: twoHeads.id,
        source: 'advancement',
        advancementOrder: 4,
        isFreeExtra: true,
      },
      {
        playerId: ids.bblOnly,
        skillId: guard.id,
        source: 'advancement',
        advancementOrder: 5,
      },
      {
        playerId: ids.bblOnly,
        source: 'characteristic',
        characteristic: 'AG',
        advancementOrder: 6,
      },
    ]);

    await runMigration(db);

    expect(await ordersAndFlags(db)).toEqual([
      [1, true],
      [2, false],
      [2, true],
      [4, false],
      [3, true],
      [4, true],
    ]);
  });

  it('shifts an increase but not a skill numbered before the free extra', async () => {
    const [mutation, dodge] = await db
      .insert(skills)
      .values([{ name: 'Tentacles' }, { name: 'Dodge' }])
      .returning();
    await db.insert(playerAdvancements).values([
      {
        playerId: ids.bblOnly,
        source: 'characteristic',
        characteristic: 'ST',
        advancementOrder: 4,
      },
      {
        playerId: ids.bblOnly,
        skillId: mutation.id,
        source: 'advancement',
        advancementOrder: 3,
        isFreeExtra: true,
      },
      {
        playerId: ids.bblOnly,
        skillId: ids.skillId,
        source: 'advancement',
        advancementOrder: 1,
      },
      {
        playerId: ids.bblOnly,
        skillId: dodge.id,
        source: 'advancement',
        advancementOrder: 2,
      },
    ]);

    await runMigration(db);

    expect(await ordersAndFlags(db)).toEqual([
      [3, true],
      [3, false],
      [1, true],
      [2, true],
    ]);
  });

  it('leaves a player whose free extra has no number unconfirmed', async () => {
    await insertAroundFreeExtra(db, ids, null);

    await runMigration(db);

    expect(await ordersAndFlags(db)).toEqual([
      [1, false],
      [null, false],
      [3, false],
      [4, false],
    ]);
  });

  it('renumbers around a free extra once, recording each change', async () => {
    await insertAroundFreeExtra(db, ids, 2);
    const before = await historyCount(db);

    await runMigration(db);
    const after = await historyCount(db);
    await runMigration(db);

    expect(after).toBe(before + 3);
    expect(await historyCount(db)).toBe(after);
    expect(await ordersAndFlags(db)).toEqual([
      [1, true],
      [2, false],
      [2, true],
      [3, true],
    ]);
  });

  it('records the change in the history table', async () => {
    await db.insert(playerAdvancements).values({
      playerId: ids.bblOnly,
      skillId: ids.skillId,
      source: 'advancement',
      advancementOrder: 1,
    });
    const before = await historyCount(db);

    await runMigration(db);

    expect(await historyCount(db)).toBe(before + 1);
  });

  it('changes nothing when run a second time', async () => {
    await db.insert(playerAdvancements).values({
      playerId: ids.bblOnly,
      skillId: ids.skillId,
      source: 'advancement',
      advancementOrder: 1,
    });

    await runMigration(db);
    const after = await historyCount(db);
    await runMigration(db);

    expect(await confirmedFlags(db)).toEqual([true]);
    expect(await historyCount(db)).toBe(after);
  });
});

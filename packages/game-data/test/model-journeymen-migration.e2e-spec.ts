/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  coaches,
  eq,
  eras,
  leagues,
  playerAdvancements,
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

function migrationStatements(): string[] {
  const folder = readdirSync(MIGRATIONS_DIR).find((name) =>
    name.endsWith('_model_journeymen'),
  );
  if (folder === undefined) {
    throw new Error('No model_journeymen migration was found.');
  }
  return readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf-8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function runMigration(db: Db): Promise<void> {
  for (const statement of migrationStatements()) {
    await db.execute(sql.raw(statement));
  }
}

interface Seeded {
  bblJourneyman: number;
  tpJourneyman: number;
  lineUpJourneyman: number;
  starNamedJourneyman: number;
  recruit: number;
  loner: number;
  block: number;
  dodge: number;
  teamEraId: number;
  linemanId: number;
}

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
  const [block, dodge, loner] = await db
    .insert(skills)
    .values([{ name: 'Block' }, { name: 'Dodge' }, { name: 'Loner' }])
    .returning();
  const [lineman, star] = await db
    .insert(positions)
    .values([
      { name: 'Lineman', isStarPlayer: false },
      { name: 'Star', isStarPlayer: true },
    ])
    .returning();
  const make = (name: string, positionId: number) => ({
    name,
    teamEraId: teamEra.id,
    positionId,
  });
  const [bbl, tp, lineUp, starNamed, recruit] = await db
    .insert(players)
    .values([
      make('journeyman', lineman.id),
      make('Journeyman', lineman.id),
      make(' JOURNEYMAN ', lineman.id),
      make('Journeyman', star.id),
      make('Nadiddnur', lineman.id),
    ])
    .returning();
  await db.insert(playerAdvancements).values([
    {
      playerId: bbl.id,
      skillId: loner.id,
      source: 'advancement',
      advancementOrder: 1,
      isFreeExtra: true,
    },
    {
      playerId: bbl.id,
      skillId: block.id,
      source: 'advancement',
      advancementOrder: 1,
      orderConfirmed: true,
    },
    {
      playerId: tp.id,
      skillId: loner.id,
      source: 'chosen',
      attributeValue: '4+',
      advancementOrder: 1,
      isFreeExtra: true,
    },
    {
      playerId: tp.id,
      skillId: dodge.id,
      source: 'random',
      advancementOrder: 2,
    },
    {
      playerId: recruit.id,
      skillId: loner.id,
      source: 'chosen',
      advancementOrder: 3,
      isFreeExtra: true,
    },
  ]);
  return {
    bblJourneyman: bbl.id,
    tpJourneyman: tp.id,
    lineUpJourneyman: lineUp.id,
    starNamedJourneyman: starNamed.id,
    recruit: recruit.id,
    loner: loner.id,
    block: block.id,
    dodge: dodge.id,
    teamEraId: teamEra.id,
    linemanId: lineman.id,
  };
}

async function newJourneyman(db: Db, ids: Seeded): Promise<number> {
  const [row] = await db
    .insert(players)
    .values({
      name: 'Journeyman',
      teamEraId: ids.teamEraId,
      positionId: ids.linemanId,
    })
    .returning();
  return row.id;
}

async function rowsOf(db: Db, playerId: number) {
  return db
    .select()
    .from(playerAdvancements)
    .where(eq(playerAdvancements.playerId, playerId))
    .orderBy(asc(playerAdvancements.id));
}

async function rowFor(db: Db, playerId: number, skillId: number) {
  const rows = await db
    .select()
    .from(playerAdvancements)
    .where(eq(playerAdvancements.playerId, playerId));
  return rows.find((row) => row.skillId === skillId);
}

async function isJourneyman(db: Db, playerId: number): Promise<boolean> {
  const [row] = await db.select().from(players).where(eq(players.id, playerId));
  return row.isJourneyman;
}

async function advancementSnapshot(db: Db) {
  return db
    .select({
      id: playerAdvancements.id,
      source: playerAdvancements.source,
      order: playerAdvancements.advancementOrder,
      confirmed: playerAdvancements.orderConfirmed,
      free: playerAdvancements.isFreeExtra,
      removed: playerAdvancements.removed,
    })
    .from(playerAdvancements)
    .orderBy(asc(playerAdvancements.id));
}

describe('model_journeymen migration (real Postgres)', () => {
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

  it('marks only players named Journeyman in a non-star position', async () => {
    await runMigration(db);

    expect(await isJourneyman(db, ids.bblJourneyman)).toBe(true);
    expect(await isJourneyman(db, ids.tpJourneyman)).toBe(true);
    expect(await isJourneyman(db, ids.lineUpJourneyman)).toBe(true);
    expect(await isJourneyman(db, ids.starNamedJourneyman)).toBe(false);
    expect(await isJourneyman(db, ids.recruit)).toBe(false);
  });

  it("turns a journeyman's gained Loner into a starting row", async () => {
    await runMigration(db);

    expect(await rowFor(db, ids.tpJourneyman, ids.loner)).toMatchObject({
      source: 'starting',
      attributeValue: '4+',
      advancementOrder: null,
      orderConfirmed: false,
      isFreeExtra: false,
      removed: false,
    });
  });

  it('closes the unconfirmed slot the Loner held', async () => {
    await runMigration(db);

    expect(await rowFor(db, ids.tpJourneyman, ids.dodge)).toMatchObject({
      advancementOrder: 1,
      orderConfirmed: false,
    });
  });

  it('leaves confirmed numbering alone', async () => {
    await runMigration(db);

    expect(await rowFor(db, ids.bblJourneyman, ids.block)).toMatchObject({
      advancementOrder: 1,
      orderConfirmed: true,
    });
  });

  it('adds a starting Loner to a journeyman with none', async () => {
    await runMigration(db);

    const rows = await db
      .select()
      .from(playerAdvancements)
      .where(eq(playerAdvancements.playerId, ids.lineUpJourneyman));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      skillId: ids.loner,
      source: 'starting',
      attributeValue: null,
    });
  });

  it("leaves a non-journeyman's gained free Loner untouched", async () => {
    await runMigration(db);

    expect(await rowFor(db, ids.recruit, ids.loner)).toMatchObject({
      source: 'chosen',
      advancementOrder: 3,
      isFreeExtra: true,
    });
  });

  it('changes nothing when run twice', async () => {
    await runMigration(db);
    const once = await advancementSnapshot(db);
    await runMigration(db);

    expect(await advancementSnapshot(db)).toEqual(once);
  });

  it('converts only the first of several Loner rows', async () => {
    const playerId = await newJourneyman(db, ids);
    await db.insert(playerAdvancements).values([
      {
        playerId,
        skillId: ids.loner,
        source: 'chosen',
        attributeValue: '3+',
        advancementOrder: 1,
        isFreeExtra: true,
      },
      {
        playerId,
        skillId: ids.loner,
        source: 'chosen',
        attributeValue: '4+',
        advancementOrder: 2,
        isFreeExtra: true,
      },
      {
        playerId,
        skillId: ids.dodge,
        source: 'random',
        advancementOrder: 3,
      },
    ]);

    await runMigration(db);

    const rows = await rowsOf(db, playerId);
    expect(rows[0]).toMatchObject({ source: 'starting', attributeValue: '3+' });
    expect(rows[1]).toMatchObject({
      source: 'chosen',
      attributeValue: '4+',
      isFreeExtra: true,
      advancementOrder: 1,
    });
    expect(rows[2]).toMatchObject({ advancementOrder: 2 });
  });

  it('keeps a gained Loner when a starting one already exists', async () => {
    const playerId = await newJourneyman(db, ids);
    await db.insert(playerAdvancements).values([
      { playerId, skillId: ids.loner, source: 'starting' },
      {
        playerId,
        skillId: ids.loner,
        source: 'chosen',
        attributeValue: '4+',
        advancementOrder: 1,
        isFreeExtra: true,
      },
      {
        playerId,
        skillId: ids.dodge,
        source: 'random',
        advancementOrder: 2,
      },
    ]);

    await runMigration(db);

    const rows = await rowsOf(db, playerId);
    expect(rows[0]).toMatchObject({ source: 'starting' });
    expect(rows[1]).toMatchObject({
      source: 'chosen',
      advancementOrder: 1,
      isFreeExtra: true,
    });
    expect(rows[2]).toMatchObject({ advancementOrder: 2 });
  });

  it('adds no Loner where a removed starting one already holds the key', async () => {
    const playerId = await newJourneyman(db, ids);
    await db.insert(playerAdvancements).values({
      playerId,
      skillId: ids.loner,
      source: 'starting',
      removed: true,
    });

    await runMigration(db);

    const rows = await rowsOf(db, playerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'starting', removed: true });
  });

  it('converts a gained Loner beside a removed starting one', async () => {
    const playerId = await newJourneyman(db, ids);
    await db.insert(playerAdvancements).values([
      {
        playerId,
        skillId: ids.loner,
        source: 'starting',
        removed: true,
      },
      {
        playerId,
        skillId: ids.loner,
        source: 'chosen',
        attributeValue: '4+',
        advancementOrder: 1,
        isFreeExtra: true,
      },
    ]);

    await runMigration(db);

    const rows = await rowsOf(db, playerId);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      source: 'starting',
      advancementOrder: null,
      removed: false,
    });
  });

  it('converts a confirmed Loner row and clears its order', async () => {
    const playerId = await newJourneyman(db, ids);
    await db.insert(playerAdvancements).values([
      {
        playerId,
        skillId: ids.loner,
        source: 'advancement',
        advancementOrder: 1,
        orderConfirmed: true,
        isFreeExtra: true,
      },
      {
        playerId,
        skillId: ids.dodge,
        source: 'random',
        advancementOrder: 2,
      },
    ]);

    await runMigration(db);

    const rows = await rowsOf(db, playerId);
    expect(rows[0]).toMatchObject({
      source: 'starting',
      advancementOrder: null,
      orderConfirmed: false,
      isFreeExtra: false,
    });
    expect(rows[1]).toMatchObject({ advancementOrder: 2 });
  });

  it('shifts unconfirmed rows but never a confirmed one', async () => {
    const playerId = await newJourneyman(db, ids);
    await db.insert(playerAdvancements).values([
      {
        playerId,
        skillId: ids.loner,
        source: 'chosen',
        advancementOrder: 1,
        isFreeExtra: true,
      },
      {
        playerId,
        skillId: ids.block,
        source: 'advancement',
        advancementOrder: 2,
        orderConfirmed: true,
      },
      {
        playerId,
        skillId: ids.dodge,
        source: 'random',
        advancementOrder: 3,
      },
    ]);

    await runMigration(db);

    const rows = await rowsOf(db, playerId);
    expect(rows[1]).toMatchObject({
      advancementOrder: 2,
      orderConfirmed: true,
    });
    expect(rows[2]).toMatchObject({
      advancementOrder: 2,
      orderConfirmed: false,
    });
  });
});

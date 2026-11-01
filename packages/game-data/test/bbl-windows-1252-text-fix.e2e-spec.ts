/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  coaches,
  coachExternalIds,
  eq,
  eras,
  externalSystems,
  leagues,
  players,
  positionExternalIds,
  positions,
  races,
  skillExternalIds,
  skills,
  sql,
  teamEras,
  teamExternalIds,
  teams,
  teamsHistory,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connectTestDb } from './e2e-database';

const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');

/** The migration's two DO blocks, run again against each test's rows. */
function fixStatements(): string[] {
  const folder = readdirSync(MIGRATIONS_DIR).find((name) =>
    name.endsWith('_fix_bbl_windows_1252_text'),
  );
  if (folder === undefined) {
    throw new Error('No fix_bbl_windows_1252_text migration was found.');
  }
  return readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf-8')
    .split('--> statement-breakpoint')
    .filter((statement) => statement.includes('DO $$'));
}

async function runFix(db: Db): Promise<void> {
  for (const statement of fixStatements()) {
    await db.execute(sql.raw(statement));
  }
}

interface Seeded {
  nameSystemId: number;
  bblSystemId: number;
  sydow: number;
  ogreFixedElsewhere: number;
  ogreBroken: number;
  twinLeft: number;
  twinRight: number;
  undefinedByteCoach: number;
  euroCoach: number;
  bblIdCoach: number;
  blitzer: number;
  snikk: number;
  zuolas: number;
  favoured: number;
  curatedCurly: number;
}

/**
 * Rows as the BBL importer stored them when it decoded pages as ISO-8859-1
 * (C1 controls where Windows-1252 has curly quotes, dashes and the ellipsis),
 * plus rows the migration must leave alone.
 */
async function seed(db: Db): Promise<Seeded> {
  const [nameSystem] = await db
    .insert(externalSystems)
    .values({ name: 'Name', category: 'bookkeeping' })
    .returning();
  const [bblSystem] = await db
    .insert(externalSystems)
    .values({ name: 'tloeg.bbleague.se', category: 'imported_data_source' })
    .returning();
  const insertCoach = async (name: string) =>
    (await db.insert(coaches).values({ name }).returning())[0].id;
  const [race] = await db.insert(races).values({ name: 'Human' }).returning();
  const coachId = await insertCoach('Plain Coach');
  const insertTeam = async (name: string) =>
    (
      await db
        .insert(teams)
        .values({ name, raceId: race.id, coachId })
        .returning()
    )[0].id;
  const sydow = await insertTeam('Doctor Sydow\u0092s Mistakes');
  const ogreFixedElsewhere = await insertTeam("Ogre's Den");
  const ogreBroken = await insertTeam('Ogre\u0092s Den');
  const twinLeft = await insertTeam('Twin\u0091s');
  const twinRight = await insertTeam('Twin\u0092s');
  const name = nameSystem.id;
  await db.insert(teamExternalIds).values([
    {
      teamId: sydow,
      externalSystemId: name,
      externalId: 'Doctor Sydow\u0092s Mistakes',
    },
    { teamId: sydow, externalSystemId: bblSystem.id, externalId: 'dok2' },
    {
      teamId: ogreFixedElsewhere,
      externalSystemId: name,
      externalId: "Ogre's Den",
    },
    {
      teamId: ogreBroken,
      externalSystemId: name,
      externalId: 'Ogre\u0092s Den',
    },
    { teamId: twinLeft, externalSystemId: name, externalId: 'Twin\u0091s' },
    { teamId: twinRight, externalSystemId: name, externalId: 'Twin\u0092s' },
  ]);
  const undefinedByteCoach = await insertCoach('Odd\u0081Byte');
  const euroCoach = await insertCoach('Euro\u0080 \u0096 Dash');
  await db.insert(coachExternalIds).values([
    {
      coachId: undefinedByteCoach,
      externalSystemId: name,
      externalId: 'Odd\u0081Byte',
    },
    {
      coachId: euroCoach,
      externalSystemId: name,
      externalId: 'Euro\u0080 \u0096 Dash',
    },
    { coachId, externalSystemId: bblSystem.id, externalId: 'Bbl\u0092Id' },
  ]);
  const [blitzer] = await db
    .insert(positions)
    .values({ name: 'Lil\u0092 Blitzer', isStarPlayer: false })
    .returning();
  await db.insert(positionExternalIds).values({
    positionId: blitzer.id,
    externalSystemId: name,
    externalId: 'Human: Lil\u0092 Blitzer',
  });
  const [league] = await db
    .insert(leagues)
    .values({ name: 'Test League' })
    .returning();
  const [era] = await db
    .insert(eras)
    .values({ name: 'Test Era', leagueId: league.id, startDate: '2020-01-01' })
    .returning();
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId: sydow, eraId: era.id })
    .returning();
  const insertPlayer = async (playerName: string) =>
    (
      await db
        .insert(players)
        .values({
          name: playerName,
          teamEraId: teamEra.id,
          positionId: blitzer.id,
        })
        .returning()
    )[0].id;
  const snikk = await insertPlayer('Snikk \u0094Toxic\u0094 Tailspike');
  const zuolas = await insertPlayer('Ą\u009euolas');
  const [favoured] = await db
    .insert(skills)
    .values({ name: 'Favoured of \u0085' })
    .returning();
  const [curatedCurly] = await db
    .insert(skills)
    .values({ name: 'Blastin’ Solves Everything' })
    .returning();
  await db.insert(skillExternalIds).values([
    {
      skillId: favoured.id,
      externalSystemId: name,
      externalId: 'Favoured of \u0085',
    },
    {
      skillId: curatedCurly.id,
      externalSystemId: name,
      externalId: 'Blastin’ Solves Everything',
    },
  ]);
  return {
    nameSystemId: name,
    bblSystemId: bblSystem.id,
    sydow,
    ogreFixedElsewhere,
    ogreBroken,
    twinLeft,
    twinRight,
    undefinedByteCoach,
    euroCoach,
    bblIdCoach: coachId,
    blitzer: blitzer.id,
    snikk,
    zuolas,
    favoured: favoured.id,
    curatedCurly: curatedCurly.id,
  };
}

/** Code-unit order, so C1 controls sort deterministically. */
function sorted(values: string[]): string[] {
  return [...values].sort();
}

async function teamName(db: Db, id: number): Promise<string> {
  return (await db.select().from(teams).where(eq(teams.id, id)))[0].name;
}

async function teamIds(
  db: Db,
  id: number,
  systemId: number,
): Promise<string[]> {
  const rows = await db
    .select({ externalId: teamExternalIds.externalId })
    .from(teamExternalIds)
    .where(
      and(
        eq(teamExternalIds.teamId, id),
        eq(teamExternalIds.externalSystemId, systemId),
      ),
    );
  return sorted(rows.map((row) => row.externalId));
}

async function coachRow(db: Db, id: number) {
  const [row] = await db.select().from(coaches).where(eq(coaches.id, id));
  const ids = await db
    .select({ externalId: coachExternalIds.externalId })
    .from(coachExternalIds)
    .where(eq(coachExternalIds.coachId, id));
  return { name: row.name, ids: sorted(ids.map((one) => one.externalId)) };
}

async function positionRow(db: Db, id: number) {
  const [row] = await db.select().from(positions).where(eq(positions.id, id));
  const ids = await db
    .select({ externalId: positionExternalIds.externalId })
    .from(positionExternalIds)
    .where(eq(positionExternalIds.positionId, id));
  return { name: row.name, ids: sorted(ids.map((one) => one.externalId)) };
}

async function skillRow(db: Db, id: number) {
  const [row] = await db.select().from(skills).where(eq(skills.id, id));
  const ids = await db
    .select({ externalId: skillExternalIds.externalId })
    .from(skillExternalIds)
    .where(eq(skillExternalIds.skillId, id));
  return {
    name: row.name,
    version: row.historyVersion,
    ids: sorted(ids.map((one) => one.externalId)),
  };
}

async function playerName(db: Db, id: number): Promise<string> {
  return (await db.select().from(players).where(eq(players.id, id)))[0].name;
}

async function sydowHistoryRows(db: Db, id: number): Promise<number> {
  return (await db.select().from(teamsHistory).where(eq(teamsHistory.id, id)))
    .length;
}

describe('fix_bbl_windows_1252_text migration (real Postgres)', () => {
  let db: Db;
  let seeded: Seeded;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    seeded = await seed(db);
  });

  it('has exactly two DO blocks', () => {
    expect(fixStatements()).toHaveLength(2);
  });

  it('rewrites a C1 apostrophe in a team name and folds it', async () => {
    await runFix(db);

    expect(await teamName(db, seeded.sydow)).toBe("Doctor Sydow's Mistakes");
  });

  it('adds the corrected Name external id and keeps the old one', async () => {
    await runFix(db);

    expect(await teamIds(db, seeded.sydow, seeded.nameSystemId)).toEqual(
      sorted(['Doctor Sydow\u0092s Mistakes', "Doctor Sydow's Mistakes"]),
    );
    expect(await teamIds(db, seeded.sydow, seeded.bblSystemId)).toEqual([
      'dok2',
    ]);
  });

  it('skips the corrected Name id when another row already holds it', async () => {
    await runFix(db);

    expect(await teamName(db, seeded.ogreBroken)).toBe("Ogre's Den");
    expect(await teamIds(db, seeded.ogreBroken, seeded.nameSystemId)).toEqual([
      'Ogre\u0092s Den',
    ]);
    expect(
      await teamIds(db, seeded.ogreFixedElsewhere, seeded.nameSystemId),
    ).toEqual(["Ogre's Den"]);
  });

  it('gives a spelling two old ids fold to only to the id registered first', async () => {
    await runFix(db);

    expect(await teamName(db, seeded.twinLeft)).toBe("Twin's");
    expect(await teamName(db, seeded.twinRight)).toBe("Twin's");
    expect(await teamIds(db, seeded.twinLeft, seeded.nameSystemId)).toEqual(
      sorted(['Twin\u0091s', "Twin's"]),
    );
    expect(await teamIds(db, seeded.twinRight, seeded.nameSystemId)).toEqual([
      'Twin\u0092s',
    ]);
  });

  it('maps curly double quotes, the z-caron, the en dash and the euro sign', async () => {
    await runFix(db);

    expect(await playerName(db, seeded.snikk)).toBe('Snikk "Toxic" Tailspike');
    expect(await playerName(db, seeded.zuolas)).toBe('Ąžuolas');
    expect(await coachRow(db, seeded.euroCoach)).toEqual({
      name: 'Euro€ – Dash',
      ids: sorted(['Euro\u0080 \u0096 Dash', 'Euro€ – Dash']),
    });
  });

  it('corrects a Name id that is not the bare name', async () => {
    await runFix(db);

    expect(await positionRow(db, seeded.blitzer)).toEqual({
      name: "Lil' Blitzer",
      ids: sorted(['Human: Lil\u0092 Blitzer', "Human: Lil' Blitzer"]),
    });
  });

  it('maps the ellipsis without folding it', async () => {
    await runFix(db);

    expect(await skillRow(db, seeded.favoured)).toEqual({
      name: 'Favoured of …',
      version: 2,
      ids: sorted(['Favoured of \u0085', 'Favoured of …']),
    });
  });

  it('leaves a byte Windows-1252 leaves undefined as it is', async () => {
    await runFix(db);

    expect(await coachRow(db, seeded.undefinedByteCoach)).toEqual({
      name: 'Odd\u0081Byte',
      ids: ['Odd\u0081Byte'],
    });
  });

  it('never touches a curated curly name or a non-Name external id', async () => {
    await runFix(db);

    expect(await skillRow(db, seeded.curatedCurly)).toEqual({
      name: 'Blastin’ Solves Everything',
      version: 1,
      ids: ['Blastin’ Solves Everything'],
    });
    expect(await coachRow(db, seeded.bblIdCoach)).toEqual({
      name: 'Plain Coach',
      ids: ['Bbl\u0092Id'],
    });
  });

  it('records the rename in history', async () => {
    await runFix(db);

    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, seeded.sydow));
    expect(team.historyVersion).toBe(2);
    expect(await sydowHistoryRows(db, seeded.sydow)).toBe(2);
  });

  it('changes nothing when run a second time', async () => {
    const snapshot = async () => ({
      sydow: await teamIds(db, seeded.sydow, seeded.nameSystemId),
      ogre: await teamIds(db, seeded.ogreBroken, seeded.nameSystemId),
      twinLeft: await teamIds(db, seeded.twinLeft, seeded.nameSystemId),
      twin: await teamIds(db, seeded.twinRight, seeded.nameSystemId),
      teamNames: await Promise.all(
        [
          seeded.sydow,
          seeded.ogreBroken,
          seeded.twinLeft,
          seeded.twinRight,
        ].map((id) => teamName(db, id)),
      ),
      teamVersions: (
        await db
          .select({ id: teams.id, version: teams.historyVersion })
          .from(teams)
          .orderBy(teams.id)
      ).map((team) => [team.id, team.version]),
      position: await positionRow(db, seeded.blitzer),
      players: await Promise.all(
        [seeded.snikk, seeded.zuolas].map((id) => playerName(db, id)),
      ),
      favoured: await skillRow(db, seeded.favoured),
      euro: await coachRow(db, seeded.euroCoach),
      undefinedByte: await coachRow(db, seeded.undefinedByteCoach),
      history: await sydowHistoryRows(db, seeded.sydow),
    });
    await runFix(db);
    const afterFirst = await snapshot();

    await runFix(db);

    expect(await snapshot()).toEqual(afterFirst);
  });
});

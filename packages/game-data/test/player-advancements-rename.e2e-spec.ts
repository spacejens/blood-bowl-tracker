/// <reference types="node" />
import type { Db } from '@blood-bowl-tracker/db';
import {
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

/** The `name` column of a raw catalog query. */
async function names(db: Db, query: string): Promise<string[]> {
  const rows = (await db.execute(sql.raw(query))) as unknown as {
    name: string;
  }[];
  return [...rows].map((row) => row.name);
}

describe('player_advancements rename (real Postgres)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
  });

  it('leaves no relation, constraint, trigger or type under the old name', async () => {
    expect(
      await names(
        db,
        "SELECT relname AS name FROM pg_class WHERE relname LIKE 'player\\_skill%'",
      ),
    ).toEqual([]);
    expect(
      await names(
        db,
        "SELECT conname AS name FROM pg_constraint WHERE conname LIKE 'player\\_skill%'",
      ),
    ).toEqual([]);
    expect(
      await names(
        db,
        "SELECT tgname AS name FROM pg_trigger WHERE tgname LIKE 'player\\_skill%'",
      ),
    ).toEqual([]);
    expect(
      await names(
        db,
        "SELECT typname AS name FROM pg_type WHERE typname LIKE 'player\\_skill%' OR typname LIKE '\\_player\\_skill%'",
      ),
    ).toEqual([]);
  });

  it('records a history row in player_advancements_history on insert', async () => {
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
    const [player] = await db
      .insert(players)
      .values({ name: 'X', teamEraId: teamEra.id, positionId: position.id })
      .returning();
    const [block] = await db
      .insert(skills)
      .values({ name: 'Block' })
      .returning();

    const [row] = await db
      .insert(playerAdvancements)
      .values({ playerId: player.id, skillId: block.id, source: 'starting' })
      .returning();

    const history = await db.select().from(playerAdvancementsHistory);
    expect(history.map((h) => h.id)).toEqual([row.id]);
  });
});

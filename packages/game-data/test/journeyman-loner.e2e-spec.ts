import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  DB,
  eq,
  playerAdvancements,
  playerAdvancementsHistory,
  players,
  skills,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import type { PlayerSkillSource } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { JourneymanLonerService } from '../src/player-skills/journeyman-loner.service';
import { PaidAdvancementSlotsService } from '../src/player-skills/paid-advancement-slots.service';
import { connectTestDb } from './e2e-database';
import type { LonerPlayerSeed } from './loner-player.test-helpers';
import { seedLonerPlayer } from './loner-player.test-helpers';

/** One row to insert for the seeded player. */
interface Row {
  skill: keyof LonerPlayerSeed['skillIds'];
  source: PlayerSkillSource;
  order?: number;
  attributeValue?: string;
  free?: boolean;
  removed?: boolean;
}

/** One stored row's skill name, source, order, free-extra and removed flags. */
type RowState = [string, PlayerSkillSource, number | null, boolean, boolean];

describe("A journeyman's starting Loner follows his marker (real Postgres)", () => {
  let db: Db;
  let service: JourneymanLonerService;
  let seed: LonerPlayerSeed;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    seed = await seedLonerPlayer(db);
    const moduleRef = await Test.createTestingModule({
      providers: [
        JourneymanLonerService,
        PaidAdvancementSlotsService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(JourneymanLonerService);
  });

  /** Store the player's marker, as the player upsert before each call does. */
  async function setMarker(isJourneyman: boolean): Promise<void> {
    await db
      .update(players)
      .set({ isJourneyman })
      .where(eq(players.id, seed.playerId));
  }

  async function ensure(): Promise<void> {
    await setMarker(true);
    await service.ensureStartingLoner(seed.playerId);
  }

  async function retire(): Promise<void> {
    await setMarker(false);
    await service.retireStartingLoner(seed.playerId);
  }

  async function insertRows(rows: Row[]): Promise<void> {
    await db.insert(playerAdvancements).values(
      rows.map((row) => ({
        playerId: seed.playerId,
        skillId: seed.skillIds[row.skill],
        source: row.source,
        attributeValue: row.attributeValue ?? null,
        advancementOrder: row.order ?? null,
        orderConfirmed: false,
        isFreeExtra: row.free ?? false,
        removed: row.removed ?? false,
      })),
    );
  }

  async function states(): Promise<RowState[]> {
    const names = new Map(
      Object.entries(seed.skillIds).map(([name, id]) => [id, name]),
    );
    const rows = await db
      .select()
      .from(playerAdvancements)
      .where(eq(playerAdvancements.playerId, seed.playerId))
      .orderBy(asc(playerAdvancements.id));
    return rows.map((row) => [
      names.get(row.skillId ?? -1) ?? '?',
      row.source,
      row.advancementOrder,
      row.isFreeExtra,
      row.removed,
    ]);
  }

  it('gives a journeyman with no rows one starting Loner, idempotently', async () => {
    await ensure();
    await ensure();

    expect(await states()).toEqual([['Loner', 'starting', null, false, false]]);
  });

  it('turns a stored gained free Loner into the starting one and closes its slot', async () => {
    await insertRows([
      { skill: 'Loner', source: 'chosen', order: 1, free: true },
      { skill: 'Dodge', source: 'chosen', order: 2 },
    ]);

    await ensure();

    expect(await states()).toEqual([
      ['Loner', 'starting', null, false, false],
      ['Dodge', 'chosen', 1, false, false],
    ]);
  });

  it('leaves a gained Loner beside an active starting one, and retires only the starting one', async () => {
    await insertRows([
      { skill: 'Loner', source: 'starting' },
      {
        skill: 'Loner',
        source: 'chosen',
        attributeValue: '4+',
        order: 1,
        free: true,
      },
    ]);

    await ensure();

    expect(await states()).toEqual([
      ['Loner', 'starting', null, false, false],
      ['Loner', 'chosen', 1, true, false],
    ]);

    await retire();

    expect(await states()).toEqual([
      ['Loner', 'starting', null, false, true],
      ['Loner', 'chosen', 1, true, false],
    ]);
  });

  it('flags the starting Loner removed on recruitment and revives the same row', async () => {
    await insertRows([{ skill: 'Loner', source: 'starting' }]);
    const [{ id }] = await db
      .select({ id: playerAdvancements.id })
      .from(playerAdvancements);
    const historyBefore = (await db.select().from(playerAdvancementsHistory))
      .length;

    await retire();

    expect(await states()).toEqual([['Loner', 'starting', null, false, true]]);
    expect(
      (await db.select().from(playerAdvancementsHistory)).length,
    ).toBeGreaterThan(historyBefore);

    await ensure();

    const rows = await db.select().from(playerAdvancements);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, source: 'starting', removed: false });
  });

  it("leaves the recruit's numbering unchanged when the starting Loner goes", async () => {
    await insertRows([
      { skill: 'Loner', source: 'starting' },
      { skill: 'Block', source: 'chosen', order: 1 },
      { skill: 'Dodge', source: 'chosen', order: 2 },
    ]);

    await retire();

    expect(await states()).toEqual([
      ['Loner', 'starting', null, false, true],
      ['Block', 'chosen', 1, false, false],
      ['Dodge', 'chosen', 2, false, false],
    ]);
  });

  it('keeps a gained free Loner through recruitment', async () => {
    await insertRows([
      { skill: 'Loner', source: 'starting' },
      {
        skill: 'Loner',
        source: 'chosen',
        attributeValue: '4+',
        order: 1,
        free: true,
      },
    ]);

    await retire();

    expect(await states()).toEqual([
      ['Loner', 'starting', null, false, true],
      ['Loner', 'chosen', 1, true, false],
    ]);
  });

  describe('with two skills named Loner', () => {
    let secondLoner: number;

    beforeEach(async () => {
      const [row] = await db
        .insert(skills)
        .values({ name: 'Loner' })
        .returning();
      secondLoner = row.id;
    });

    it('ensures exactly one starting Loner when it is on the second skill', async () => {
      await db.insert(playerAdvancements).values({
        playerId: seed.playerId,
        skillId: secondLoner,
        source: 'starting',
      });

      await ensure();

      const rows = await db
        .select()
        .from(playerAdvancements)
        .where(eq(playerAdvancements.playerId, seed.playerId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ skillId: secondLoner, removed: false });
    });

    it('inserts on the lowest-id Loner and retires it without failing', async () => {
      await ensure();
      await retire();

      const rows = await db
        .select()
        .from(playerAdvancements)
        .where(eq(playerAdvancements.playerId, seed.playerId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        skillId: Math.min(seed.skillIds.Loner, secondLoner),
        source: 'starting',
        removed: true,
      });
    });
  });

  it('survives two concurrent ensures of the same journeyman', async () => {
    await setMarker(true);
    await Promise.all([
      service.ensureStartingLoner(seed.playerId),
      service.ensureStartingLoner(seed.playerId),
      service.ensureStartingLoner(seed.playerId),
    ]);

    expect(await states()).toEqual([['Loner', 'starting', null, false, false]]);
  });
});

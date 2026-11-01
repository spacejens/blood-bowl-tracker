/// <reference types="node" />
import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  coaches,
  DB,
  eq,
  eras,
  leagues,
  playerAdvancements,
  players,
  positions,
  races,
  skills,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicAdvancementPlannerService } from '../src/player-skills/characteristic-advancement-planner.service';
import { PlayerAdvancementSyncPlannerService } from '../src/player-skills/player-advancement-sync-planner.service';
import { PlayerSkillsService } from '../src/player-skills/player-skills.service';
import { connectTestDb } from './e2e-database';

/** One stored row, as the assertions compare it. */
interface StoredRow {
  id: number;
  skillId: number | null;
  characteristic: string | null;
  advancementOrder: number | null;
  orderConfirmed: boolean;
  removed: boolean;
}

/**
 * The live TP import writes a player's new advancements twice: first
 * unconfirmed at the next numbers, then, once the order is deduced from the
 * row ids the first write returned, confirmed at the deduced numbers. The
 * second write must land each deduced number on the very row the first write
 * returned for that entry, which only holds if both writes pair entries with
 * stored rows the same way. These cases run that sequence against the real
 * planners and Postgres.
 */
describe('PlayerSkillsService two-step live write (real Postgres)', () => {
  let db: Db;
  let service: PlayerSkillsService;
  let playerId: number;
  let blockId: number;
  let dodgeId: number;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
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
    const [block, dodge] = await db
      .insert(skills)
      .values([{ name: 'Block' }, { name: 'Dodge' }])
      .returning();
    playerId = player.id;
    blockId = block.id;
    dodgeId = dodge.id;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerSkillsService,
        PlayerAdvancementSyncPlannerService,
        CharacteristicAdvancementPlannerService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PlayerSkillsService);
  });

  const agility = (
    advancementOrder: number | null,
    orderConfirmed = false,
  ): PlayerSkillEntry => ({
    playerId,
    source: 'characteristic',
    characteristic: 'AG',
    advancementOrder,
    ...(orderConfirmed ? { orderConfirmed } : {}),
  });

  const gainedSkill = (
    skillId: number,
    advancementOrder: number,
    orderConfirmed = false,
  ): PlayerSkillEntry => ({
    playerId,
    skillId,
    source: 'random',
    advancementOrder,
    ...(orderConfirmed ? { orderConfirmed } : {}),
  });

  async function write(entries: PlayerSkillEntry[]): Promise<number[]> {
    const result = await service.sync({
      entries,
      characteristicPlayerIds: [playerId],
    });
    return result.playerSkillIds;
  }

  /**
   * The second write as the live import builds it: each pending entry takes
   * the number deduced for the row id the first write returned at its index.
   */
  function confirmed(options: {
    entries: PlayerSkillEntry[];
    firstIds: number[];
    numbers: Map<number, number>;
  }): PlayerSkillEntry[] {
    const { entries, firstIds, numbers } = options;
    return entries.map((entry, index) => {
      const number = numbers.get(firstIds[index]);
      return number === undefined
        ? entry
        : { ...entry, advancementOrder: number, orderConfirmed: true };
    });
  }

  async function storedRows(): Promise<StoredRow[]> {
    return db
      .select({
        id: playerAdvancements.id,
        skillId: playerAdvancements.skillId,
        characteristic: playerAdvancements.characteristic,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
        removed: playerAdvancements.removed,
      })
      .from(playerAdvancements)
      .where(eq(playerAdvancements.playerId, playerId))
      .orderBy(asc(playerAdvancements.id));
  }

  function rowById(rows: StoredRow[], id: number): StoredRow | undefined {
    return rows.find((row) => row.id === id);
  }

  it('confirms the deduced numbers on the rows the first write returned, beside a stored increase of unknown order', async () => {
    const [storedAgId] = await write([agility(null)]);

    // The stored AG is the only paid advancement, so the new ones take 2 and 3:
    // the new skill first, then the new AG, as the fallback order lists them.
    const plan = [gainedSkill(dodgeId, 2), agility(null), agility(3)];
    const firstIds = await write(plan);
    // The deduction found the increase was taken first: AG at 2, Dodge at 3.
    const numbers = new Map([
      [firstIds[0], 3],
      [firstIds[2], 2],
    ]);
    const secondIds = await write(
      confirmed({ entries: plan, firstIds, numbers }),
    );

    expect(secondIds).toEqual(firstIds);
    const rows = await storedRows();
    expect(rows.filter((row) => row.removed)).toEqual([]);
    expect(rowById(rows, firstIds[0])).toMatchObject({
      skillId: dodgeId,
      advancementOrder: 3,
      orderConfirmed: true,
    });
    expect(rowById(rows, firstIds[2])).toMatchObject({
      characteristic: 'AG',
      advancementOrder: 2,
      orderConfirmed: true,
    });
    expect(rowById(rows, firstIds[1])).toMatchObject({
      characteristic: 'AG',
      advancementOrder: null,
      orderConfirmed: false,
    });
    // Ordered entries pair before unordered ones, so the new AG took over the
    // stored row and the kept one of unknown order got a row of its own.
    expect(firstIds[2]).toBe(storedAgId);
    expect(rows).toHaveLength(3);
  });

  it('keeps a stored confirmed increase on its row when a new one is confirmed at a different number', async () => {
    const [, storedAgId] = await write([
      gainedSkill(blockId, 1, true),
      agility(2, true),
    ]);

    const plan = [
      gainedSkill(blockId, 1, true),
      gainedSkill(dodgeId, 3),
      agility(2, true),
      agility(4),
    ];
    const firstIds = await write(plan);
    const numbers = new Map([
      [firstIds[1], 4],
      [firstIds[3], 3],
    ]);
    const secondIds = await write(
      confirmed({ entries: plan, firstIds, numbers }),
    );

    expect(secondIds).toEqual(firstIds);
    expect(firstIds[2]).toBe(storedAgId);
    const rows = await storedRows();
    expect(rowById(rows, storedAgId)).toMatchObject({
      characteristic: 'AG',
      advancementOrder: 2,
      orderConfirmed: true,
    });
    expect(rowById(rows, firstIds[3])).toMatchObject({
      characteristic: 'AG',
      advancementOrder: 3,
      orderConfirmed: true,
    });
    expect(rowById(rows, firstIds[1])).toMatchObject({
      skillId: dodgeId,
      advancementOrder: 4,
      orderConfirmed: true,
    });
    expect(rows.filter((row) => row.removed)).toEqual([]);
    expect(rows).toHaveLength(4);
  });
});

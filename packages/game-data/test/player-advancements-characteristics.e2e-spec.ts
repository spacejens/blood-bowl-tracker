/// <reference types="node" />
import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  coaches,
  DB,
  eq,
  eras,
  leagues,
  playerAdvancements,
  playerAdvancementsHistory,
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

describe('player_advancements characteristic rows (real Postgres)', () => {
  let db: Db;
  let playerId: number;
  let skillId: number;

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
    const [block] = await db
      .insert(skills)
      .values({ name: 'Block' })
      .returning();
    playerId = player.id;
    skillId = block.id;
  });

  const characteristicRow = {
    source: 'characteristic' as const,
    characteristic: 'AG' as const,
  };

  it('lets one player raise the same characteristic twice', async () => {
    await expect(
      db
        .insert(playerAdvancements)
        .values([
          { playerId, ...characteristicRow },
          { playerId, ...characteristicRow },
        ])
        .returning(),
    ).resolves.toHaveLength(2);
  });

  it('rejects a characteristic row that names a skill', async () => {
    await expect(
      db
        .insert(playerAdvancements)
        .values({ playerId, skillId, ...characteristicRow }),
    ).rejects.toThrow();
  });

  it('rejects a skill row with a characteristic, and one with neither', async () => {
    await expect(
      db.insert(playerAdvancements).values({
        playerId,
        skillId,
        source: 'chosen',
        characteristic: 'AG',
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(playerAdvancements).values({ playerId, source: 'chosen' }),
    ).rejects.toThrow();
  });

  it('rejects a characteristic row that is a free extra or carries a variant', async () => {
    await expect(
      db
        .insert(playerAdvancements)
        .values({ playerId, ...characteristicRow, isFreeExtra: true }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(playerAdvancements)
        .values({ playerId, ...characteristicRow, attributeValue: 'x' }),
    ).rejects.toThrow();
  });

  it('accepts a confirmed order only when there is an order', async () => {
    await expect(
      db.insert(playerAdvancements).values({
        playerId,
        ...characteristicRow,
        orderConfirmed: true,
        advancementOrder: null,
      }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(playerAdvancements)
        .values({
          playerId,
          ...characteristicRow,
          orderConfirmed: true,
          advancementOrder: 3,
        })
        .returning(),
    ).resolves.toHaveLength(1);
  });

  it('lets only a characteristic row be removed', async () => {
    await expect(
      db
        .insert(playerAdvancements)
        .values({ playerId, skillId, source: 'chosen', removed: true }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(playerAdvancements)
        .values({ playerId, ...characteristicRow, removed: true })
        .returning(),
    ).resolves.toHaveLength(1);
  });

  it('keeps skill rows unique per player, skill and variant', async () => {
    const skillRow = { playerId, skillId, source: 'chosen' as const };
    await db.insert(playerAdvancements).values(skillRow);
    await expect(
      db.insert(playerAdvancements).values(skillRow),
    ).rejects.toThrow();

    await db
      .insert(playerAdvancements)
      .values({ ...skillRow, attributeValue: 'Orc' });
    await expect(
      db
        .insert(playerAdvancements)
        .values({ ...skillRow, attributeValue: 'Orc' }),
    ).rejects.toThrow();
  });

  it('treats a null variant and an empty-string variant as different', async () => {
    const skillRow = { playerId, skillId, source: 'chosen' as const };
    await db.insert(playerAdvancements).values(skillRow);
    await expect(
      db
        .insert(playerAdvancements)
        .values({ ...skillRow, attributeValue: '' })
        .returning(),
    ).resolves.toHaveLength(1);
  });

  describe('PlayerSkillsService.sync round trip', () => {
    let service: PlayerSkillsService;

    beforeEach(async () => {
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

    const byId = (a: number, b: number): number => a - b;

    async function syncAg(count: number): Promise<number[]> {
      const result = await service.sync({
        entries: Array.from({ length: count }, () => ({
          playerId,
          ...characteristicRow,
        })),
        characteristicPlayerIds: [playerId],
      });
      return result.playerSkillIds;
    }

    async function storedRows(): Promise<{ id: number; removed: boolean }[]> {
      return db
        .select({
          id: playerAdvancements.id,
          removed: playerAdvancements.removed,
        })
        .from(playerAdvancements)
        .where(eq(playerAdvancements.playerId, playerId))
        .orderBy(asc(playerAdvancements.id));
    }

    it('writes, keeps, removes and revives increase rows', async () => {
      const firstIds = (await syncAg(2)).sort(byId);
      expect(await storedRows()).toEqual(
        firstIds.map((id) => ({ id, removed: false })),
      );

      const historyBefore = await db.select().from(playerAdvancementsHistory);
      expect((await syncAg(2)).sort(byId)).toEqual(firstIds);
      expect(await db.select().from(playerAdvancementsHistory)).toHaveLength(
        historyBefore.length,
      );

      await syncAg(1);
      const afterRemoval = await storedRows();
      expect(afterRemoval).toHaveLength(2);
      expect(afterRemoval.filter((row) => row.removed)).toHaveLength(1);

      expect((await syncAg(2)).sort(byId)).toEqual(firstIds);
      expect(await storedRows()).toEqual(
        firstIds.map((id) => ({ id, removed: false })),
      );
    });

    it('appends unordered increases after the highest order', async () => {
      await service.sync({
        entries: [
          { playerId, skillId, source: 'chosen', advancementOrder: 2 },
          { playerId, ...characteristicRow },
        ],
        characteristicPlayerIds: [playerId],
      });
      const [row] = await db
        .select({ advancementOrder: playerAdvancements.advancementOrder })
        .from(playerAdvancements)
        .where(eq(playerAdvancements.source, 'characteristic'));
      expect(row.advancementOrder).toBe(3);
    });
  });
});

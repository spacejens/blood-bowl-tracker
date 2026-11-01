/// <reference types="node" />
import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
});

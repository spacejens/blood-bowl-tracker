import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eq,
  externalSystems,
  playerAdvancements,
  playerExternalIds,
  players,
  positionRulesSets,
  positionRulesSetSkills,
  positions,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicAdvancementPlannerService } from '../src/player-skills/characteristic-advancement-planner.service';
import { JourneymanLonerService } from '../src/player-skills/journeyman-loner.service';
import { PaidAdvancementSlotsService } from '../src/player-skills/paid-advancement-slots.service';
import { PlayerAdvancementSyncPlannerService } from '../src/player-skills/player-advancement-sync-planner.service';
import { PlayerSkillsService } from '../src/player-skills/player-skills.service';
import { PlayerCharacteristicsValidationService } from '../src/players/player-characteristics-validation.service';
import { PlayerLastingInjuryValidationService } from '../src/players/player-lasting-injury-validation.service';
import { PlayersService } from '../src/players/players.service';
import { CharacteristicFormatValidationService } from '../src/shared/characteristic-format-validation.service';
import { connectTestDb } from './e2e-database';
import type { LonerPlayerSeed } from './loner-player.test-helpers';
import { seedLonerPlayer } from './loner-player.test-helpers';

/** A starting Loner row, active or retired. */
const startingLoner = (removed: boolean) => ({
  source: 'starting',
  advancementOrder: null,
  isFreeExtra: false,
  removed,
});

describe('Recruiting a journeyman through player upserts and skill syncs (real Postgres)', () => {
  let db: Db;
  let playersService: PlayersService;
  let playerSkills: PlayerSkillsService;
  let seed: LonerPlayerSeed;
  let externalSystemId: number;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    seed = await seedLonerPlayer(db);
    const [system] = await db
      .insert(externalSystems)
      .values({ name: 'tourplay.net', category: 'imported_data_source' })
      .returning();
    externalSystemId = system.id;
    await db.insert(playerExternalIds).values({
      playerId: seed.playerId,
      externalSystemId,
      externalId: '1',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayersService,
        PlayerCharacteristicsValidationService,
        CharacteristicFormatValidationService,
        PlayerLastingInjuryValidationService,
        JourneymanLonerService,
        PaidAdvancementSlotsService,
        PlayerSkillsService,
        PlayerAdvancementSyncPlannerService,
        CharacteristicAdvancementPlannerService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    playersService = moduleRef.get(PlayersService);
    playerSkills = moduleRef.get(PlayerSkillsService);
  });

  async function upsert(isJourneyman: boolean): Promise<void> {
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, seed.playerId));
    await playersService.upsert({
      name: player.name,
      teamEraId: player.teamEraId,
      positionId: player.positionId,
      isJourneyman,
      externalIds: [{ externalSystemId, externalId: '1' }],
    });
  }

  async function lonerRows(): Promise<Record<string, unknown>[]> {
    return db
      .select({
        source: playerAdvancements.source,
        advancementOrder: playerAdvancements.advancementOrder,
        isFreeExtra: playerAdvancements.isFreeExtra,
        removed: playerAdvancements.removed,
      })
      .from(playerAdvancements)
      .where(eq(playerAdvancements.skillId, seed.skillIds.Loner));
  }

  it("turns a recruit's still-listed Loner into a gained free extra, and back on re-marking", async () => {
    await upsert(true);
    await upsert(false);
    expect(await lonerRows()).toEqual([startingLoner(true)]);

    await playerSkills.sync({
      entries: [
        {
          playerId: seed.playerId,
          skillId: seed.skillIds.Loner,
          source: 'chosen',
          advancementOrder: 1,
        },
      ],
    });

    expect(await lonerRows()).toEqual([
      {
        source: 'chosen',
        advancementOrder: 1,
        isFreeExtra: true,
        removed: false,
      },
    ]);

    await upsert(true);

    expect(await lonerRows()).toEqual([startingLoner(false)]);
  });

  it('retires a starting Loner a failed recruitment left behind on the next write', async () => {
    await upsert(true);
    // The marker already reads false, as if an earlier write had stored it
    // but failed before retiring the Loner.
    await db
      .update(players)
      .set({ isJourneyman: false })
      .where(eq(players.id, seed.playerId));

    await upsert(false);

    expect(await lonerRows()).toEqual([startingLoner(true)]);
  });

  it('keeps the starting Loner of a player whose position starts with it', async () => {
    const [positionRulesSet] = await db
      .select({ id: positionRulesSets.id })
      .from(positionRulesSets);
    await db.insert(positionRulesSetSkills).values({
      positionRulesSetId: positionRulesSet.id,
      skillId: seed.skillIds.Loner,
    });
    await db.insert(playerAdvancements).values({
      playerId: seed.playerId,
      skillId: seed.skillIds.Loner,
      source: 'starting',
    });

    await upsert(false);
    await upsert(false);

    expect(await lonerRows()).toEqual([startingLoner(false)]);
  });

  it('keeps the starting Loner of a star-player position with no starting skills recorded', async () => {
    const [mercenary] = await db
      .insert(positions)
      .values({ name: 'Giant Mercenary', isStarPlayer: true })
      .returning();
    await db
      .update(players)
      .set({ positionId: mercenary.id })
      .where(eq(players.id, seed.playerId));
    await db.insert(playerAdvancements).values({
      playerId: seed.playerId,
      skillId: seed.skillIds.Loner,
      source: 'starting',
    });

    await upsert(false);
    await upsert(false);

    expect(await lonerRows()).toEqual([startingLoner(false)]);
  });
});

import 'reflect-metadata';

import type { FillIncompletePlayer } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  asc,
  coaches,
  DB,
  eq,
  eraRulesSets,
  eras,
  externalSystems,
  leagues,
  playerAdvancements,
  playerExternalIds,
  players,
  positionRulesSets,
  positionRulesSetSkillCategories,
  positions,
  races,
  rulesSets,
  skillRulesSets,
  skills,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { TP_EXTERNAL_SYSTEM_NAME } from '@blood-bowl-tracker/domain-enums';
import {
  CharacteristicFormatMismatchError,
  IncompletePlayerFillError,
  PlayerFillModule,
  PlayerFillService,
  PlayersModule,
  PlayersService,
} from '@blood-bowl-tracker/game-data';
import type { DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { IncompleteImportPlayersService } from '../src/players/incomplete-import-players.service';
import { PlayersQueriesModule } from '../src/players/players-queries.module';
import { connectTestDb } from './e2e-database';

class TestDbModule {}

/** Provides the DB token globally, the way the application's DbModule does. */
function makeDbModule(db: Db): DynamicModule {
  return {
    module: TestDbModule,
    global: true,
    providers: [{ provide: DB, useValue: db }],
    exports: [DB],
  };
}

interface Seed {
  playerId: number;
  teamEraId: number;
  positionId: number;
  tpSystemId: number;
  blockId: number;
  dodgeId: number;
}

/**
 * One BB2020 lineman (general and agility primary) on a TP team, stored
 * with nothing but his name, position and TP id, so every incomplete
 * criterion matches. A chosen primary skill costs 6 SPP as advancement 1.
 */
async function seed(db: Db): Promise<Seed> {
  const [tp] = await db
    .insert(externalSystems)
    .values({ name: TP_EXTERNAL_SYSTEM_NAME, category: 'imported_data_source' })
    .returning();
  const [league] = await db.insert(leagues).values({ name: 'L' }).returning();
  const [bb2020] = await db
    .insert(rulesSets)
    .values({ name: 'BB2020', passingFormat: 'plus' })
    .returning();
  const [era] = await db
    .insert(eras)
    .values({ name: 'Third', leagueId: league.id, startDate: '2020-01-01' })
    .returning();
  await db
    .insert(eraRulesSets)
    .values({ eraId: era.id, rulesSetId: bb2020.id });
  const [block] = await db.insert(skills).values({ name: 'Block' }).returning();
  const [dodge] = await db.insert(skills).values({ name: 'Dodge' }).returning();
  await db.insert(skillRulesSets).values([
    { skillId: block.id, rulesSetId: bb2020.id, category: 'general' },
    { skillId: dodge.id, rulesSetId: bb2020.id, category: 'agility' },
  ]);
  await db.insert(advancementCosts).values(
    [6, 8, 12, 16, 20, 30].map((sppCost, index) => ({
      rulesSetId: bb2020.id,
      advancementNumber: index + 1,
      advancementKind: 'chosen_primary_skill' as const,
      sppCost,
    })),
  );
  const [lineman] = await db
    .insert(positions)
    .values({ name: 'Lineman', isStarPlayer: false })
    .returning();
  const [linemanBb2020] = await db
    .insert(positionRulesSets)
    .values({
      positionId: lineman.id,
      rulesSetId: bb2020.id,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    })
    .returning();
  await db.insert(positionRulesSetSkillCategories).values([
    {
      positionRulesSetId: linemanBb2020.id,
      skillCategory: 'general',
      access: 'primary',
    },
    {
      positionRulesSetId: linemanBb2020.id,
      skillCategory: 'agility',
      access: 'primary',
    },
  ]);
  const [coach] = await db.insert(coaches).values({ name: 'C' }).returning();
  const [race] = await db.insert(races).values({ name: 'Human' }).returning();
  const [team] = await db
    .insert(teams)
    .values({ name: 'T', raceId: race.id, coachId: coach.id })
    .returning();
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId: team.id, eraId: era.id })
    .returning();
  const [player] = await db
    .insert(players)
    .values({
      name: 'Incomplete',
      teamEraId: teamEra.id,
      positionId: lineman.id,
    })
    .returning();
  await db.insert(playerExternalIds).values({
    playerId: player.id,
    externalSystemId: tp.id,
    externalId: '586220',
  });
  return {
    playerId: player.id,
    teamEraId: teamEra.id,
    positionId: lineman.id,
    tpSystemId: tp.id,
    blockId: block.id,
    dodgeId: dodge.id,
  };
}

describe('Filling in a missing TP player (real Postgres)', () => {
  let db: Db;
  let service: PlayerFillService;
  let playersService: PlayersService;
  let incomplete: IncompleteImportPlayersService;
  let seeded: Seed;

  const entry = (
    overrides: Partial<FillIncompletePlayer> = {},
  ): FillIncompletePlayer => ({
    playerId: seeded.playerId,
    status: 'active',
    characteristics: {
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    },
    sppTotal: 8,
    unspentSpp: 2,
    startingSkills: [{ skillId: seeded.blockId, attributeValue: null }],
    advancements: [
      {
        kind: 'skill',
        skillId: seeded.dodgeId,
        attributeValue: null,
        source: 'chosen',
        isFreeExtra: false,
      },
    ],
    ...overrides,
  });

  const storedRows = () =>
    db
      .select({
        skillId: playerAdvancements.skillId,
        source: playerAdvancements.source,
        advancementOrder: playerAdvancements.advancementOrder,
        orderConfirmed: playerAdvancements.orderConfirmed,
      })
      .from(playerAdvancements)
      .where(eq(playerAdvancements.playerId, seeded.playerId))
      .orderBy(asc(playerAdvancements.id));

  const storedPlayer = async () => {
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, seeded.playerId));
    return player;
  };

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    seeded = await seed(db);
    const moduleRef = await Test.createTestingModule({
      imports: [
        makeDbModule(db),
        PlayerFillModule,
        PlayersModule,
        PlayersQueriesModule,
      ],
    }).compile();
    service = moduleRef.get(PlayerFillService);
    playersService = moduleRef.get(PlayersService);
    incomplete = moduleRef.get(IncompleteImportPlayersService);
  });

  it('fills the player in, so the incomplete query stops counting him', async () => {
    expect(await incomplete.findTeamsWithIncompletePlayers()).toHaveLength(1);

    await expect(service.fill(entry())).resolves.toEqual({
      playerId: seeded.playerId,
      outcome: 'filled',
    });

    expect(await incomplete.findTeamsWithIncompletePlayers()).toEqual([]);
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, seeded.playerId));
    expect(player).toMatchObject({
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
      sppTotal: 8,
      unspentSpp: 2,
      sppAdjustment: 8,
      status: 'active',
    });
    expect(await storedRows()).toEqual([
      {
        skillId: seeded.blockId,
        source: 'starting',
        advancementOrder: null,
        orderConfirmed: false,
      },
      {
        skillId: seeded.dodgeId,
        source: 'chosen',
        advancementOrder: 1,
        orderConfirmed: true,
      },
    ]);
  });

  it('answers unchanged when the same entry is applied again', async () => {
    await service.fill(entry());
    const firstPlayer = await storedPlayer();
    const firstRows = await storedRows();

    await expect(service.fill(entry())).resolves.toEqual({
      playerId: seeded.playerId,
      outcome: 'unchanged',
    });
    expect(await storedPlayer()).toEqual(firstPlayer);
    expect(await storedRows()).toEqual(firstRows);
    expect(firstRows).toHaveLength(2);
  });

  it('keeps the filled status through a later TP upsert that establishes none', async () => {
    await service.fill(entry());

    // The shape the bulk TP import sends for a player whose TP entry has no
    // status: no status, and the total deferred to the SPP sync.
    await playersService.upsert({
      name: 'Incomplete',
      teamEraId: seeded.teamEraId,
      positionId: seeded.positionId,
      externalIds: [
        { externalSystemId: seeded.tpSystemId, externalId: '586220' },
      ],
    });

    expect((await storedPlayer()).status).toBe('active');
    expect(await incomplete.findTeamsWithIncompletePlayers()).toEqual([]);
  });

  it('refuses a different entry once the player is complete', async () => {
    await service.fill(entry());
    const rowsBefore = await storedRows();

    await expect(service.fill(entry({ status: 'dead' }))).rejects.toThrow(
      IncompletePlayerFillError,
    );
    expect((await storedPlayer()).status).toBe('active');
    expect(await storedRows()).toEqual(rowsBefore);
  });

  it('refuses an entry that contradicts a stored value, writing nothing', async () => {
    await db
      .update(players)
      .set({ move: 5 })
      .where(eq(players.id, seeded.playerId));
    const before = await storedPlayer();
    expect(before.move).toBe(5);

    await expect(service.fill(entry())).rejects.toThrow(
      IncompletePlayerFillError,
    );
    expect(await storedPlayer()).toEqual(before);
    expect(await storedRows()).toEqual([]);
  });

  it('refuses advancements the reported spend does not allow, writing nothing', async () => {
    const before = await storedPlayer();
    await expect(service.fill(entry({ unspentSpp: 0 }))).rejects.toThrow(
      IncompletePlayerFillError,
    );

    expect(await storedPlayer()).toEqual(before);
    expect(await storedRows()).toEqual([]);
    expect(await incomplete.findTeamsWithIncompletePlayers()).toHaveLength(1);
  });

  it('refuses a missing PA under a rules set with Passing, writing nothing', async () => {
    const before = await storedPlayer();
    await expect(
      service.fill(
        entry({
          characteristics: {
            move: 6,
            strength: 3,
            agility: 3,
            passing: null,
            armour: 9,
          },
        }),
      ),
    ).rejects.toThrow(CharacteristicFormatMismatchError);
    expect(await storedPlayer()).toEqual(before);
    expect(await storedRows()).toEqual([]);
    expect(await incomplete.findTeamsWithIncompletePlayers()).toHaveLength(1);
  });
});

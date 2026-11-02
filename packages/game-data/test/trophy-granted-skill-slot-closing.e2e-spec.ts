import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  coaches,
  DB,
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
import type { PlayerSkillSource } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicAdvancementPlannerService } from '../src/player-skills/characteristic-advancement-planner.service';
import { PaidAdvancementSlotsService } from '../src/player-skills/paid-advancement-slots.service';
import { PlayerAdvancementSyncPlannerService } from '../src/player-skills/player-advancement-sync-planner.service';
import { PlayerSkillsService } from '../src/player-skills/player-skills.service';
import { connectTestDb } from './e2e-database';

interface Fixtures {
  playerId: number;
  otherPlayerId: number;
  /** Skill name -> id: Block, Dodge, Guard, Tentacles, Two Heads. */
  skillIds: Record<string, number>;
}

/** Two players on one team and the skills the cases give them. */
async function seed(db: Db): Promise<Fixtures> {
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
  const [player, otherPlayer] = await db
    .insert(players)
    .values(
      ['A', 'B'].map((name) => ({
        name,
        teamEraId: teamEra.id,
        positionId: position.id,
      })),
    )
    .returning();
  const skillRows = await db
    .insert(skills)
    .values(
      ['Block', 'Dodge', 'Guard', 'Tentacles', 'Two Heads'].map((name) => ({
        name,
      })),
    )
    .returning();
  return {
    playerId: player.id,
    otherPlayerId: otherPlayer.id,
    skillIds: Object.fromEntries(skillRows.map((row) => [row.name, row.id])),
  };
}

/** One row to insert: a skill name, or a characteristic increase. */
interface Row {
  skill?: string;
  attributeValue?: string;
  order: number | null;
  confirmed?: boolean;
  free?: boolean;
  removed?: boolean;
  playerId?: number;
  source?: PlayerSkillSource;
}

/** Each row's order, confirmation and free-extra flag, in insertion order. */
type RowState = [number | null, boolean, boolean];

describe('Marking a trophy-granted skill free closes its slot (real Postgres)', () => {
  let db: Db;
  let service: PlayerSkillsService;
  let fixtures: Fixtures;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    fixtures = await seed(db);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerSkillsService,
        PlayerAdvancementSyncPlannerService,
        CharacteristicAdvancementPlannerService,
        PaidAdvancementSlotsService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PlayerSkillsService);
  });

  async function insertRows(rows: Row[]): Promise<void> {
    await db.insert(playerAdvancements).values(
      rows.map((row) => ({
        playerId: row.playerId ?? fixtures.playerId,
        ...(row.skill === undefined
          ? { source: 'characteristic' as const, characteristic: 'AG' as const }
          : {
              source: row.source ?? ('advancement' as const),
              skillId: fixtures.skillIds[row.skill],
              attributeValue: row.attributeValue ?? null,
            }),
        advancementOrder: row.order,
        orderConfirmed: row.confirmed ?? true,
        isFreeExtra: row.free ?? false,
        removed: row.removed ?? false,
      })),
    );
  }

  async function states(): Promise<RowState[]> {
    const rows = await db
      .select()
      .from(playerAdvancements)
      .orderBy(asc(playerAdvancements.id));
    return rows.map((row) => [
      row.advancementOrder,
      row.orderConfirmed,
      row.isFreeExtra,
    ]);
  }

  async function historyCount(): Promise<number> {
    return (await db.select().from(playerAdvancementsHistory)).length;
  }

  async function mark(skill: string): Promise<void> {
    await service.markTrophyGranted(
      fixtures.playerId,
      fixtures.skillIds[skill],
    );
  }

  it('closes a mid-sequence slot: later skills and increases shift down', async () => {
    await insertRows([
      { skill: 'Block', order: 1 },
      { skill: 'Tentacles', order: 2 },
      { skill: 'Dodge', order: 3 },
      { order: 4 },
    ]);

    await mark('Tentacles');

    expect(await states()).toEqual([
      [1, true, false],
      [2, false, true],
      [2, true, false],
      [3, true, false],
    ]);
  });

  it('closes the first slot', async () => {
    await insertRows([
      { skill: 'Tentacles', order: 1 },
      { skill: 'Block', order: 2 },
      { order: 3 },
    ]);

    await mark('Tentacles');

    expect(await states()).toEqual([
      [1, false, true],
      [1, true, false],
      [2, true, false],
    ]);
  });

  it('closes the last slot, shifting nothing', async () => {
    await insertRows([
      { skill: 'Block', order: 1 },
      { order: 2 },
      { skill: 'Tentacles', order: 3 },
    ]);

    await mark('Tentacles');

    expect(await states()).toEqual([
      [1, true, false],
      [2, true, false],
      [3, false, true],
    ]);
  });

  it('closes each slot once when two skills of one player are marked in turn', async () => {
    await insertRows([
      { skill: 'Block', order: 1 },
      { skill: 'Tentacles', order: 2 },
      { skill: 'Dodge', order: 3 },
      { skill: 'Two Heads', order: 4 },
      { order: 5 },
      { skill: 'Guard', order: 6 },
    ]);

    await mark('Tentacles');
    await mark('Two Heads');

    expect(await states()).toEqual([
      [1, true, false],
      [2, false, true],
      [2, true, false],
      [3, false, true],
      [3, true, false],
      [4, true, false],
    ]);
  });

  it('closes both slots when one call marks two rows of the skill', async () => {
    await insertRows([
      { skill: 'Block', order: 1 },
      { skill: 'Tentacles', attributeValue: 'a', order: 2 },
      { skill: 'Dodge', order: 3 },
      { skill: 'Tentacles', attributeValue: 'b', order: 4 },
      { order: 5 },
    ]);

    await mark('Tentacles');

    expect(await states()).toEqual([
      [1, true, false],
      [2, false, true],
      [2, true, false],
      [4, false, true],
      [3, true, false],
    ]);
  });

  it('renumbers nothing when the marked row was unconfirmed', async () => {
    await insertRows([
      { skill: 'Block', order: 1 },
      { skill: 'Tentacles', order: 2, confirmed: false },
      { skill: 'Dodge', order: 3 },
      { order: 4 },
    ]);

    await mark('Tentacles');

    expect(await states()).toEqual([
      [1, true, false],
      [2, false, true],
      [3, true, false],
      [4, true, false],
    ]);
  });

  it('closes the slot of a TP-confirmed chosen skill the same way', async () => {
    await insertRows([
      { skill: 'Block', order: 1, source: 'chosen' },
      { skill: 'Tentacles', order: 2, source: 'random' },
      { skill: 'Dodge', order: 3, source: 'chosen' },
      { order: 4 },
    ]);

    await mark('Tentacles');

    expect(await states()).toEqual([
      [1, true, false],
      [2, false, true],
      [2, true, false],
      [3, true, false],
    ]);
  });

  it("shifts only the player's confirmed, non-removed paid rows", async () => {
    await insertRows([
      { skill: 'Tentacles', order: 1 },
      { skill: 'Dodge', order: 2, confirmed: false },
      { skill: 'Guard', order: 3, free: true, confirmed: false },
      { order: 4, removed: true },
      { skill: 'Block', order: 5, playerId: fixtures.otherPlayerId },
    ]);

    await mark('Tentacles');

    expect(await states()).toEqual([
      [1, false, true],
      [2, false, false],
      [3, false, true],
      [4, true, false],
      [5, true, false],
    ]);
  });

  it('records one history row per changed row', async () => {
    await insertRows([
      { skill: 'Block', order: 1 },
      { skill: 'Tentacles', order: 2 },
      { skill: 'Dodge', order: 3 },
      { order: 4 },
    ]);
    const before = await historyCount();

    await mark('Tentacles');

    expect(await historyCount()).toBe(before + 3);
  });

  it('changes nothing, history included, when the row is already free', async () => {
    await insertRows([
      { skill: 'Block', order: 1 },
      { skill: 'Tentacles', order: 2 },
      { skill: 'Dodge', order: 3 },
    ]);
    await mark('Tentacles');
    const after = await historyCount();
    const stateAfter = await states();

    await mark('Tentacles');

    expect(await states()).toEqual(stateAfter);
    expect(await historyCount()).toBe(after);
  });

  it('leaves the closed numbering as it is when the skill is unmarked again', async () => {
    await insertRows([
      { skill: 'Block', order: 1 },
      { skill: 'Tentacles', order: 2 },
      { skill: 'Dodge', order: 3 },
    ]);
    await mark('Tentacles');

    await service.unmarkTrophyGranted(
      fixtures.playerId,
      fixtures.skillIds['Tentacles'],
    );

    expect(await states()).toEqual([
      [1, true, false],
      [2, false, false],
      [2, true, false],
    ]);
  });

  it('leaves a starting row of the skill non-free and renumbers nothing', async () => {
    await insertRows([
      { skill: 'Tentacles', order: null, confirmed: false, source: 'starting' },
      { skill: 'Block', order: 1 },
      { skill: 'Dodge', order: 2 },
    ]);

    await mark('Tentacles');

    expect(await states()).toEqual([
      [null, false, false],
      [1, true, false],
      [2, true, false],
    ]);
  });

  it('marks only the gained row when the skill is also a starting skill', async () => {
    await insertRows([
      { skill: 'Tentacles', order: null, confirmed: false, source: 'starting' },
      { skill: 'Block', order: 1 },
      { skill: 'Tentacles', attributeValue: 'g', order: 2 },
      { skill: 'Dodge', order: 3 },
    ]);

    await mark('Tentacles');

    expect(await states()).toEqual([
      [null, false, false],
      [1, true, false],
      [2, false, true],
      [2, true, false],
    ]);
  });
});

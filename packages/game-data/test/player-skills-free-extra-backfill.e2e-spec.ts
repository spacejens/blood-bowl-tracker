/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  coaches,
  competitionGroups,
  competitions,
  eq,
  eras,
  leagues,
  players,
  playerSkills,
  positions,
  races,
  skills,
  sql,
  teamEras,
  teams,
  trophies,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connectTestDb } from './e2e-database';

const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');

/** The migration's backfill statements, run again against each test's rows. */
function backfillStatements(): string[] {
  const folder = readdirSync(MIGRATIONS_DIR).find((name) =>
    name.endsWith('_add_player_skill_free_extra'),
  );
  if (folder === undefined) {
    throw new Error('No add_player_skill_free_extra migration was found.');
  }
  return readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf-8')
    .split('--> statement-breakpoint')
    .filter((statement) =>
      statement.includes('UPDATE "game_data"."player_skills"'),
    );
}

async function runBackfill(db: Db): Promise<void> {
  for (const statement of backfillStatements()) {
    await db.execute(sql.raw(statement));
  }
}

/**
 * Two players: a mutant whose trophy awards grant Tentacles and (oddly)
 * Hatred, and a hater with two gained Hatred rows and an unawarded Tentacles.
 */
async function seed(db: Db): Promise<void> {
  const [league] = await db
    .insert(leagues)
    .values({ name: 'Test League' })
    .returning();
  const [era] = await db
    .insert(eras)
    .values({ name: 'Test Era', leagueId: league.id, startDate: '2020-01-01' })
    .returning();
  const [coach] = await db
    .insert(coaches)
    .values({ name: 'Test Coach' })
    .returning();
  const [race] = await db
    .insert(races)
    .values({ name: 'Test Race' })
    .returning();
  const [team] = await db
    .insert(teams)
    .values({ name: 'Test Team', raceId: race.id, coachId: coach.id })
    .returning();
  const [teamEra] = await db
    .insert(teamEras)
    .values({ teamId: team.id, eraId: era.id })
    .returning();
  const [position] = await db
    .insert(positions)
    .values({ name: 'Blitzer', isStarPlayer: false })
    .returning();
  const [mutant] = await db
    .insert(players)
    .values({ name: 'Mutant', teamEraId: teamEra.id, positionId: position.id })
    .returning();
  const [hater] = await db
    .insert(players)
    .values({ name: 'Hater', teamEraId: teamEra.id, positionId: position.id })
    .returning();
  const [hatred] = await db
    .insert(skills)
    .values({ name: 'Hatred' })
    .returning();
  const [tentacles] = await db
    .insert(skills)
    .values({ name: 'Tentacles' })
    .returning();
  const [block] = await db.insert(skills).values({ name: 'Block' }).returning();
  const [group] = await db
    .insert(competitionGroups)
    .values({
      name: 'Chaos Cup',
      leagueId: league.id,
      namePattern: '^Chaos Cup\\s*\\d+$',
    })
    .returning();
  const [competition] = await db
    .insert(competitions)
    .values({
      name: 'Chaos Cup 1',
      type: 'season',
      eraId: era.id,
      competitionGroupId: group.id,
      startDate: '2020-02-01',
    })
    .returning();
  const trophy = async (name: string) =>
    (
      await db
        .insert(trophies)
        .values({
          name,
          recipientKind: 'player',
          competitionGroupId: group.id,
          leagueId: null,
          awardRuleKind: 'manual',
          awardProcedure: 'Chosen by the organiser.',
        })
        .returning()
    )[0];
  const gods = await trophy('Gudarnas Förkämpe');
  const odd = await trophy('Odd Award');
  await db.insert(trophyAwards).values({
    trophyId: gods.id,
    competitionId: competition.id,
    teamEraId: teamEra.id,
    playerId: mutant.id,
    grantedSkillId: tentacles.id,
  });
  await db.insert(trophyAwards).values({
    trophyId: odd.id,
    competitionId: competition.id,
    teamEraId: teamEra.id,
    playerId: mutant.id,
    grantedSkillId: hatred.id,
  });
  await db.insert(playerSkills).values([
    { playerId: mutant.id, skillId: tentacles.id, source: 'advancement' },
    { playerId: mutant.id, skillId: block.id, source: 'advancement' },
    {
      playerId: mutant.id,
      skillId: hatred.id,
      source: 'starting',
      attributeValue: 'Dwarf',
    },
    {
      playerId: hater.id,
      skillId: hatred.id,
      source: 'chosen',
      attributeValue: 'Orc',
    },
    {
      playerId: hater.id,
      skillId: hatred.id,
      source: 'random',
      attributeValue: 'Elf',
    },
    { playerId: hater.id, skillId: tentacles.id, source: 'advancement' },
  ]);
}

interface FlagRow {
  player: string;
  skill: string;
  attr: string | null;
  free: boolean;
}

async function flags(db: Db): Promise<FlagRow[]> {
  return await db
    .select({
      player: players.name,
      skill: skills.name,
      attr: playerSkills.attributeValue,
      free: playerSkills.isFreeExtra,
    })
    .from(playerSkills)
    .innerJoin(players, eq(players.id, playerSkills.playerId))
    .innerJoin(skills, eq(skills.id, playerSkills.skillId))
    .orderBy(asc(playerSkills.id));
}

const EXPECTED: FlagRow[] = [
  { player: 'Mutant', skill: 'Tentacles', attr: null, free: true },
  { player: 'Mutant', skill: 'Block', attr: null, free: false },
  { player: 'Mutant', skill: 'Hatred', attr: 'Dwarf', free: false },
  { player: 'Hater', skill: 'Hatred', attr: 'Orc', free: true },
  { player: 'Hater', skill: 'Hatred', attr: 'Elf', free: true },
  { player: 'Hater', skill: 'Tentacles', attr: null, free: false },
];

describe('add_player_skill_free_extra backfill (real Postgres)', () => {
  let db: Db;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    await seed(db);
  });

  it('has exactly two backfill statements', () => {
    expect(backfillStatements()).toHaveLength(2);
  });

  it('defaults every seeded row to not free', async () => {
    expect((await flags(db)).every((row) => !row.free)).toBe(true);
  });

  it('marks every gained Hatred and each trophy-granted skill other than Hatred', async () => {
    await runBackfill(db);

    expect(await flags(db)).toEqual(EXPECTED);
  });

  it('changes nothing when run a second time', async () => {
    await runBackfill(db);
    await runBackfill(db);

    expect(await flags(db)).toEqual(EXPECTED);
  });
});

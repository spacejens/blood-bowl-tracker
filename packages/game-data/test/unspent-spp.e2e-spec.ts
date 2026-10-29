import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  coaches,
  competitionGroups,
  competitions,
  DB,
  eraRulesSets,
  eras,
  leagues,
  players,
  playerSkills,
  positionRulesSets,
  positionRulesSetSkillCategories,
  positions,
  races,
  rulesSets,
  skillRulesSets,
  skills,
  teamEras,
  teams,
  trophies,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import type {
  AdvancementKind,
  PlayerSkillSource,
} from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AdvancementKindCandidatesService } from '../src/spp/advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from '../src/spp/advancement-spend-range.service';
import { UnspentSppService } from '../src/spp/unspent-spp.service';
import { connectTestDb } from './e2e-database';

/** The players seeded for the batch, one per scenario. */
interface SeededPlayers {
  fixedThreshold: number;
  fanFavourite: number;
  typePriced: number;
  trophyGranted: number;
  starPlayer: number;
  twoRulesSets: number;
}

/** Each skill's id by name. */
type SkillIds = Record<string, number>;

const SKILL_NAMES = [
  'Block',
  'Dodge',
  'Sure Hands',
  'Tackle',
  'Wrestle',
  'Kick',
  'Mighty Blow',
  'Sidestep',
  'Jump Up',
  'Leap',
  'Fan Favourite',
  'Tentacles',
];

async function insertOne<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  return row;
}

/** One rules set's own cost rows of one kind, numbered from 1. */
function costRows(
  rulesSetId: number,
  advancementKind: AdvancementKind,
  sppCosts: number[],
) {
  return sppCosts.map((sppCost, index) => ({
    rulesSetId,
    advancementNumber: index + 1,
    advancementKind,
    sppCost,
  }));
}

/**
 * The real rows the service reads, inserted in foreign-key order. Each e2e
 * spec seeds exactly what it needs, inline.
 */
async function seed(db: Db): Promise<SeededPlayers> {
  const tloeg = await insertOne(
    db.insert(leagues).values({ name: 'tLoEG' }).returning(),
  );
  const other = await insertOne(
    db.insert(leagues).values({ name: 'Other League' }).returning(),
  );
  const crp = await insertOne(
    db.insert(rulesSets).values({ name: 'CRP' }).returning(),
  );
  const bb2020 = await insertOne(
    db.insert(rulesSets).values({ name: 'BB2020' }).returning(),
  );
  const era = (name: string, leagueId: number) =>
    insertOne(
      db
        .insert(eras)
        .values({ name, leagueId, startDate: '2020-01-01' })
        .returning(),
    );
  const fixedEra = await era('Fixed Era', tloeg.id);
  const typedEra = await era('Typed Era', other.id);
  const bothEra = await era('Both Era', other.id);
  await db.insert(eraRulesSets).values([
    { eraId: fixedEra.id, rulesSetId: crp.id },
    { eraId: typedEra.id, rulesSetId: bb2020.id },
    { eraId: bothEra.id, rulesSetId: crp.id },
    { eraId: bothEra.id, rulesSetId: bb2020.id },
  ]);

  const skillRows = await db
    .insert(skills)
    .values(SKILL_NAMES.map((name) => ({ name })))
    .returning();
  const skill: SkillIds = Object.fromEntries(
    skillRows.map((row) => [row.name, row.id]),
  );
  await db.insert(skillRulesSets).values([
    { skillId: skill.Block, rulesSetId: bb2020.id, category: 'general' },
    {
      skillId: skill['Mighty Blow'],
      rulesSetId: bb2020.id,
      category: 'strength',
    },
    { skillId: skill.Sidestep, rulesSetId: bb2020.id, category: 'agility' },
    { skillId: skill['Jump Up'], rulesSetId: bb2020.id, category: 'agility' },
    { skillId: skill.Leap, rulesSetId: bb2020.id, category: 'agility' },
  ]);

  await db.insert(advancementCosts).values([
    ...costRows(crp.id, 'table_roll', [6, 10, 15, 20, 25, 100]),
    ...costRows(bb2020.id, 'random_primary_skill', [3, 4, 6, 8, 10, 15]),
    ...costRows(bb2020.id, 'chosen_primary_skill', [6, 8, 12, 16, 20, 30]),
    ...costRows(bb2020.id, 'random_secondary_skill', [6, 8, 12, 16, 20, 30]),
    ...costRows(bb2020.id, 'chosen_secondary_skill', [12, 14, 18, 22, 26, 40]),
    ...costRows(bb2020.id, 'random_characteristic', [18, 20, 24, 28, 32, 50]),
    ...[
      { leagueId: tloeg.id, sppCost: 125 },
      { leagueId: other.id, sppCost: 50 },
    ].map((row) => ({
      ...row,
      rulesSetId: crp.id,
      advancementNumber: 7,
      advancementKind: 'granted_skill' as const,
      skillId: skill['Fan Favourite'],
    })),
  ]);

  const lineman = await insertOne(
    db
      .insert(positions)
      .values({ name: 'Lineman', isStarPlayer: false })
      .returning(),
  );
  const star = await insertOne(
    db
      .insert(positions)
      .values({ name: 'Griff Oberwald', isStarPlayer: true })
      .returning(),
  );
  const linemanBb2020 = await insertOne(
    db
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
      .returning(),
  );
  await db.insert(positionRulesSetSkillCategories).values([
    {
      positionRulesSetId: linemanBb2020.id,
      skillCategory: 'general',
      access: 'primary',
    },
    {
      positionRulesSetId: linemanBb2020.id,
      skillCategory: 'agility',
      access: 'secondary',
    },
    // A dropped category: had it counted, Mighty Blow would be primary only.
    {
      positionRulesSetId: linemanBb2020.id,
      skillCategory: 'strength',
      access: 'primary',
      removed: true,
    },
  ]);

  const coach = await insertOne(
    db.insert(coaches).values({ name: 'Test Coach' }).returning(),
  );
  const race = await insertOne(
    db.insert(races).values({ name: 'Human' }).returning(),
  );
  const team = await insertOne(
    db
      .insert(teams)
      .values({ name: 'Test Team', raceId: race.id, coachId: coach.id })
      .returning(),
  );
  const teamEra = async (eraId: number) =>
    (
      await insertOne(
        db.insert(teamEras).values({ teamId: team.id, eraId }).returning(),
      )
    ).id;
  const fixedTeamEra = await teamEra(fixedEra.id);
  const typedTeamEra = await teamEra(typedEra.id);
  const bothTeamEra = await teamEra(bothEra.id);

  const player = async (values: {
    name: string;
    teamEraId: number;
    sppTotal: number;
    positionId?: number;
    strengthIncreaseCount?: number;
  }) =>
    (
      await insertOne(
        db
          .insert(players)
          .values({ positionId: lineman.id, ...values })
          .returning(),
      )
    ).id;
  const gained = (
    playerId: number,
    names: string[],
    source: PlayerSkillSource = 'advancement',
  ) =>
    db
      .insert(playerSkills)
      .values(
        names.map((name) => ({ playerId, skillId: skill[name], source })),
      );

  // CRP: a starting skill, a gained skill and a strength increase.
  const fixedThreshold = await player({
    name: 'Fixed',
    teamEraId: fixedTeamEra,
    sppTotal: 20,
    strengthIncreaseCount: 1,
  });
  await gained(fixedThreshold, ['Block'], 'starting');
  await gained(fixedThreshold, ['Dodge']);

  // tLoEG under CRP: six table rolls and Fan Favourite as advancement 7.
  const fanFavourite = await player({
    name: 'Favourite',
    teamEraId: fixedTeamEra,
    sppTotal: 320,
  });
  await gained(fanFavourite, [
    'Block',
    'Dodge',
    'Sure Hands',
    'Tackle',
    'Wrestle',
    'Kick',
    'Fan Favourite',
  ]);

  // BB2020: Block is general (primary); Mighty Blow is strength, whose only
  // row is removed, so it could be primary or secondary.
  const typePriced = await player({
    name: 'Typed',
    teamEraId: typedTeamEra,
    sppTotal: 30,
  });
  await gained(typePriced, ['Block', 'Mighty Blow'], 'chosen');

  // CRP: one gained skill plus a trophy's skill that costs nothing.
  const trophyGranted = await player({
    name: 'Mutant',
    teamEraId: fixedTeamEra,
    sppTotal: 6,
  });
  await gained(trophyGranted, ['Dodge', 'Tentacles']);
  const group = await insertOne(
    db
      .insert(competitionGroups)
      .values({
        name: 'Major Season',
        leagueId: tloeg.id,
        namePattern: '^Major Season\\s*\\d+$',
      })
      .returning(),
  );
  const competition = await insertOne(
    db
      .insert(competitions)
      .values({
        name: 'Season 1',
        type: 'season',
        eraId: fixedEra.id,
        competitionGroupId: group.id,
        startDate: '2020-02-01',
      })
      .returning(),
  );
  const trophy = await insertOne(
    db
      .insert(trophies)
      .values({
        name: 'Champion of the Gods',
        recipientKind: 'player',
        competitionGroupId: group.id,
        leagueId: null,
        awardRuleKind: 'manual',
        awardProcedure: 'Voted on by all coaches after the season.',
      })
      .returning(),
  );
  await db.insert(trophyAwards).values({
    trophyId: trophy.id,
    competitionId: competition.id,
    teamEraId: fixedTeamEra,
    playerId: trophyGranted,
    grantedSkillId: skill.Tentacles,
  });

  const starPlayer = await player({
    name: 'Star',
    teamEraId: fixedTeamEra,
    sppTotal: 100,
    positionId: star.id,
  });

  // CRP and BB2020: three chosen agility (secondary) skills.
  const twoRulesSets = await player({
    name: 'Both',
    teamEraId: bothTeamEra,
    sppTotal: 50,
  });
  await gained(twoRulesSets, ['Sidestep', 'Jump Up', 'Leap'], 'chosen');

  return {
    fixedThreshold,
    fanFavourite,
    typePriced,
    trophyGranted,
    starPlayer,
    twoRulesSets,
  };
}

describe('UnspentSppService.forPlayers (real Postgres)', () => {
  let db: Db;
  let service: UnspentSppService;
  let seeded: SeededPlayers;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    seeded = await seed(db);
    // The two collaborators are pure and dependency-free, so they are real.
    const moduleRef = await Test.createTestingModule({
      providers: [
        UnspentSppService,
        AdvancementKindCandidatesService,
        AdvancementSpendRangeService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(UnspentSppService);
  });

  it('works out every player of one batch from the stored rows', async () => {
    const results = await service.forPlayers([
      seeded.fixedThreshold,
      seeded.fanFavourite,
      seeded.typePriced,
      seeded.trophyGranted,
      seeded.starPlayer,
      seeded.twoRulesSets,
    ]);

    expect(results.get(seeded.fixedThreshold)).toEqual({
      status: 'known',
      totalSpp: 20,
      advancementsGained: 2,
      spentMin: 16,
      spentMax: 16,
      unspentMin: 4,
      unspentMax: 4,
      cheapestNextCost: 15,
      coversAnother: 'no',
    });
    // The other league's 50-SPP Fan Favourite row does not apply.
    expect(results.get(seeded.fanFavourite)).toEqual({
      status: 'known',
      totalSpp: 320,
      advancementsGained: 7,
      spentMin: 301,
      spentMax: 301,
      unspentMin: 19,
      unspentMax: 19,
      cheapestNextCost: null,
      coversAnother: 'no',
    });
    // Block chosen primary; Mighty Blow chosen primary or secondary.
    expect(results.get(seeded.typePriced)).toEqual({
      status: 'known',
      totalSpp: 30,
      advancementsGained: 2,
      spentMin: 14,
      spentMax: 20,
      unspentMin: 10,
      unspentMax: 16,
      cheapestNextCost: 6,
      coversAnother: 'yes',
    });
    expect(results.get(seeded.trophyGranted)).toEqual({
      status: 'known',
      totalSpp: 6,
      advancementsGained: 1,
      spentMin: 6,
      spentMax: 6,
      unspentMin: 0,
      unspentMax: 0,
      cheapestNextCost: 10,
      coversAnother: 'no',
    });
    expect(results.get(seeded.starPlayer)).toEqual({
      status: 'unknown',
      reason: 'star_player',
    });
    // CRP: spent 31, next 20. BB2020: spent 44, next 8. Both say no.
    expect(results.get(seeded.twoRulesSets)).toEqual({
      status: 'known',
      totalSpp: 50,
      advancementsGained: 3,
      spentMin: 31,
      spentMax: 44,
      unspentMin: 6,
      unspentMax: 19,
      cheapestNextCost: 8,
      coversAnother: 'no',
    });
  });

  it('answers a single player with forPlayer', async () => {
    expect(await service.forPlayer(seeded.fixedThreshold)).toMatchObject({
      status: 'known',
      unspentMin: 4,
    });
  });
});

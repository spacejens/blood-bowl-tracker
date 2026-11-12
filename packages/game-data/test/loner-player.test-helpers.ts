import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  coaches,
  eraRulesSets,
  eras,
  leagues,
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
import type { AdvancementKind } from '@blood-bowl-tracker/domain-enums';

/** Test-only seed. Do not import from production code. */
export interface LonerPlayerSeed {
  playerId: number;
  skillIds: { Block: number; Dodge: number; Loner: number };
}

/** The SPP the seeded player reports as spent: total 10, unspent 0. */
export const LONER_PLAYER_SPENT = 10;

function costRows(rulesSetId: number, kind: AdvancementKind, costs: number[]) {
  return costs.map((sppCost, index) => ({
    rulesSetId,
    advancementNumber: index + 1,
    advancementKind: kind,
    sppCost,
  }));
}

/**
 * One BB2020 lineman with general and agility primary, in an era priced by
 * BB2020's per-kind costs, reporting 10 SPP total and 0 unspent. No
 * advancement rows are stored: each spec syncs its own.
 */
export async function seedLonerPlayer(db: Db): Promise<LonerPlayerSeed> {
  const [league] = await db.insert(leagues).values({ name: 'L' }).returning();
  const [bb2020] = await db
    .insert(rulesSets)
    .values({ name: 'BB2020' })
    .returning();
  const [era] = await db
    .insert(eras)
    .values({ name: 'Third', leagueId: league.id, startDate: '2020-01-01' })
    .returning();
  await db
    .insert(eraRulesSets)
    .values({ eraId: era.id, rulesSetId: bb2020.id });
  const skillRows = await db
    .insert(skills)
    .values(['Block', 'Dodge', 'Loner'].map((name) => ({ name })))
    .returning();
  const ids = new Map(skillRows.map((row) => [row.name, row.id]));
  const id = (name: string): number => {
    const found = ids.get(name);
    if (found === undefined) {
      throw new Error(`Skill ${name} was not seeded`);
    }
    return found;
  };
  await db.insert(skillRulesSets).values([
    { skillId: id('Block'), rulesSetId: bb2020.id, category: 'general' },
    { skillId: id('Dodge'), rulesSetId: bb2020.id, category: 'agility' },
  ]);
  await db
    .insert(advancementCosts)
    .values([
      ...costRows(bb2020.id, 'random_primary_skill', [3, 4, 6, 8, 10, 15]),
      ...costRows(bb2020.id, 'chosen_primary_skill', [6, 8, 12, 16, 20, 30]),
      ...costRows(bb2020.id, 'random_secondary_skill', [6, 8, 12, 16, 20, 30]),
      ...costRows(
        bb2020.id,
        'chosen_secondary_skill',
        [12, 14, 18, 22, 26, 40],
      ),
      ...costRows(bb2020.id, 'random_characteristic', [18, 20, 24, 28, 32, 50]),
    ]);
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
      name: 'Nadiddnur-shaped',
      teamEraId: teamEra.id,
      positionId: lineman.id,
      sppTotal: LONER_PLAYER_SPENT,
      unspentSpp: 0,
    })
    .returning();
  return {
    playerId: player.id,
    skillIds: { Block: id('Block'), Dodge: id('Dodge'), Loner: id('Loner') },
  };
}

import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  eq,
  eraRulesSets,
  eras,
  positionRulesSets,
  positionRulesSetSkills,
  positionsRaceEras,
  raceEras,
  races,
  rulesSets,
  skillRulesSets,
  skills,
} from '@blood-bowl-tracker/db';
import type { CharacteristicFormat } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

/** One rules set the star is hireable under, with its display formats. */
export interface StarPlayerRulesSetRow {
  rulesSetId: number;
  rulesSetName: string;
  moveFormat: CharacteristicFormat;
  strengthFormat: CharacteristicFormat;
  agilityFormat: CharacteristicFormat;
  passingFormat: CharacteristicFormat;
  armourFormat: CharacteristicFormat;
}

/** One stored `position_rules_sets` row for the star. */
export interface StarPlayerCharacteristicsRow {
  rulesSetId: number;
  move: number;
  strength: number;
  agility: number;
  /** null under a rules set whose `passing_format` is 'absent'. */
  passing: number | null;
  armour: number;
}

/** One stored starting skill of the star, under one rules set. */
export interface StarPlayerSkillRow {
  rulesSetId: number;
  skillName: string;
  attributeValue: string | null;
  /**
   * The skill's category under that rules set, or null when no
   * `skill_rules_sets` row exists for the pair — itself a curation gap worth
   * seeing rather than hiding.
   */
  category: string | null;
}

/** One (race, era) pair the star is stored as hireable in. */
export interface StarPlayerHireRow {
  raceId: number;
  raceName: string;
  eraId: number;
  eraName: string;
  startDate: string;
  endDate: string | null;
}

/**
 * The three star-scoped projections every data-type module needs: the rules
 * sets the star's stored eligibility implies, the characteristics rows it
 * actually has, and the (race, era) pairs it is hireable in.
 *
 * "Rules sets the star existed under" is derived from eligibility
 * (`positions_race_eras` -> `race_eras` -> `eras` -> `era_rules_sets`), not
 * from the characteristics rows themselves — otherwise a missing
 * characteristics row could never show up as missing, which is exactly the
 * discrepancy this tool exists to surface.
 */
@Injectable()
export class StarPlayerPositionsQueryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async rulesSetsFor(positionId: number): Promise<StarPlayerRulesSetRow[]> {
    return await this.db
      .selectDistinct({
        rulesSetId: rulesSets.id,
        rulesSetName: rulesSets.name,
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
      })
      .from(positionsRaceEras)
      .innerJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .innerJoin(eraRulesSets, eq(eraRulesSets.eraId, raceEras.eraId))
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .where(eq(positionsRaceEras.positionId, positionId))
      .orderBy(asc(rulesSets.name));
  }

  async characteristicsFor(
    positionId: number,
  ): Promise<StarPlayerCharacteristicsRow[]> {
    return await this.db
      .select({
        rulesSetId: positionRulesSets.rulesSetId,
        move: positionRulesSets.move,
        strength: positionRulesSets.strength,
        agility: positionRulesSets.agility,
        passing: positionRulesSets.passing,
        armour: positionRulesSets.armour,
      })
      .from(positionRulesSets)
      .where(eq(positionRulesSets.positionId, positionId))
      .orderBy(asc(positionRulesSets.rulesSetId));
  }

  async skillsFor(positionId: number): Promise<StarPlayerSkillRow[]> {
    return await this.db
      .select({
        rulesSetId: positionRulesSets.rulesSetId,
        skillName: skills.name,
        attributeValue: positionRulesSetSkills.attributeValue,
        category: skillRulesSets.category,
      })
      .from(positionRulesSetSkills)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetSkills.positionRulesSetId),
      )
      .innerJoin(skills, eq(skills.id, positionRulesSetSkills.skillId))
      .leftJoin(
        skillRulesSets,
        and(
          eq(skillRulesSets.skillId, positionRulesSetSkills.skillId),
          eq(skillRulesSets.rulesSetId, positionRulesSets.rulesSetId),
        ),
      )
      .where(eq(positionRulesSets.positionId, positionId))
      .orderBy(asc(positionRulesSets.rulesSetId), asc(skills.name));
  }

  async hireEligibilityFor(positionId: number): Promise<StarPlayerHireRow[]> {
    return await this.db
      .select({
        raceId: races.id,
        raceName: races.name,
        eraId: eras.id,
        eraName: eras.name,
        startDate: eras.startDate,
        endDate: eras.endDate,
      })
      .from(positionsRaceEras)
      .innerJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .innerJoin(races, eq(races.id, raceEras.raceId))
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(eq(positionsRaceEras.positionId, positionId))
      .orderBy(asc(races.name), asc(eras.startDate));
  }
}

import {
  CHARACTERISTIC_FORMATS,
  PLAYER_STATUSES,
} from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import type { FillPlannerInput } from './fill-plan.types';
import {
  CANDIDATES_SQL,
  CONSEQUENCES_SQL,
  ERA_RULES_SETS_SQL,
  FREE_SKILL_RISK_SQL,
  ONGOING_COMPETITION_NAMES,
  ONGOING_COMPETITIONS_SQL,
  POSITION_RULES_SETS_SQL,
  POSITION_SKILLS_SQL,
  STORED_ADVANCEMENTS_SQL,
} from './incomplete-player-fill.sql';
import { ProductionJsonQueryService } from './production-json-query.service';

const id = z.number().int();
const value = z.number().int();
const format = z.enum(CHARACTERISTIC_FORMATS);

const CandidateRowSchema = z.object({
  playerId: id,
  tpId: z.string().min(1),
  teamId: id,
  positionId: id,
  eraId: id,
  sppTotal: value.nullable(),
  unspentSpp: value.nullable(),
  status: z.enum(PLAYER_STATUSES).nullable(),
  isJourneyman: z.boolean(),
  move: value,
  strength: value,
  agility: value,
  passing: value.nullable(),
  armour: value,
});

const ConsequenceRowSchema = z.object({
  playerId: id,
  hasStatReduction: z.boolean(),
  hasDeath: z.boolean(),
});

const StoredAdvancementRowSchema = z.object({
  playerId: id,
  source: z.string(),
  skillId: id.nullable(),
  skillName: z.string().nullable(),
  attributeValue: z.string().nullable(),
  isFreeExtra: z.boolean(),
});

const PlayerIdRowSchema = z.object({ playerId: id });

const OngoingRowSchema = z.object({
  competitionName: z.string(),
  teamId: id.nullable(),
});

const PositionRulesSetRowSchema = z.object({
  positionRulesSetId: id,
  positionId: id,
  eraId: id,
  rulesSetId: id,
  line: z.object({
    ma: value,
    st: value,
    ag: value,
    pa: value.nullable(),
    av: value,
  }),
  formats: z.object({
    ma: format,
    st: format,
    ag: format,
    pa: format,
    av: format,
  }),
});

const PositionSkillRowSchema = z.object({
  positionRulesSetId: id,
  skillId: id,
  nameId: z.string().nullable(),
  attributeValue: z.string().nullable(),
});

const EraRulesSetRowSchema = z.object({
  eraId: id,
  rulesSetId: id,
  cheapestCost: value.nullable(),
});

/**
 * Reads what the fill planner needs from production, one read-only query
 * per kind of row, and validates every row before the planner sees it.
 */
@Injectable()
export class IncompletePlayerFillQueriesService {
  constructor(private readonly json: ProductionJsonQueryService) {}

  async load(): Promise<FillPlannerInput> {
    const ongoing = await this.rows(ONGOING_COMPETITIONS_SQL, OngoingRowSchema);
    this.assertOngoingFound(ongoing);
    const candidates = await this.rows(CANDIDATES_SQL, CandidateRowSchema);
    const consequences = await this.rows(
      CONSEQUENCES_SQL,
      ConsequenceRowSchema,
    );
    return {
      candidates,
      statReductionPlayerIds: consequences
        .filter((row) => row.hasStatReduction)
        .map((row) => row.playerId),
      deathPlayerIds: consequences
        .filter((row) => row.hasDeath)
        .map((row) => row.playerId),
      storedAdvancements: await this.rows(
        STORED_ADVANCEMENTS_SQL,
        StoredAdvancementRowSchema,
      ),
      freeSkillRiskPlayerIds: (
        await this.rows(FREE_SKILL_RISK_SQL, PlayerIdRowSchema)
      ).map((row) => row.playerId),
      ongoingTeamIds: ongoing.flatMap((row) =>
        row.teamId === null ? [] : [row.teamId],
      ),
      positionRulesSets: await this.rows(
        POSITION_RULES_SETS_SQL,
        PositionRulesSetRowSchema,
      ),
      positionSkills: await this.rows(
        POSITION_SKILLS_SQL,
        PositionSkillRowSchema,
      ),
      eraRulesSets: await this.rows(ERA_RULES_SETS_SQL, EraRulesSetRowSchema),
    };
  }

  private async rows<T extends z.ZodType>(
    sql: string,
    schema: T,
  ): Promise<z.infer<T>[]> {
    return z.array(schema).parse(await this.json.rows(sql));
  }

  /**
   * Without the ongoing competitions every player of their teams would be
   * filled as retired, so a name that matches nothing stops the run.
   */
  private assertOngoingFound(
    rows: readonly { competitionName: string }[],
  ): void {
    for (const name of ONGOING_COMPETITION_NAMES) {
      if (!rows.some((row) => row.competitionName === name)) {
        throw new Error(
          `Ongoing competition "${name}" not found in the database. Its ` +
            "teams' players cannot be told apart from retired ones; check " +
            'the stored competition name in ONGOING_COMPETITION_NAMES.',
        );
      }
    }
  }
}

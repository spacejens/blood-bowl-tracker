import {
  ADVANCEMENT_KINDS,
  CHARACTERISTIC_FORMATS,
  PLAYER_STATUSES,
  SKILL_ACCESS_LEVELS,
  SKILL_CATEGORIES,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  CHARACTERISTIC_KEYS,
  type FillPlannerRows,
  type LastingInjuryRepairCandidate,
  type OngoingCompetitionSummary,
} from './fill-plan.types';
import {
  ADVANCEMENT_COSTS_SQL,
  ATTRIBUTED_SKILLS_SQL,
  BIG_GUY_POSITIONS_SQL,
  CANDIDATES_SQL,
  CONSEQUENCES_SQL,
  DEATH_TIMES_SQL,
  ERA_RULES_SETS_SQL,
  FREE_SKILL_RISK_SQL,
  LASTING_INJURY_REPAIRS_SQL,
  ONGOING_COMPETITIONS_SQL,
  PAID_ADVANCEMENTS_SQL,
  POSITION_ACCESS_SQL,
  POSITION_RULES_SETS_SQL,
  POSITION_SKILLS_SQL,
  SKILL_CATEGORIES_SQL,
  SKILL_NAMES_SQL,
  STAT_REDUCTION_EVENTS_SQL,
  STORED_ADVANCEMENTS_SQL,
  TEAM_COMPETITIONS_SQL,
  TEAM_PLAYERS_SQL,
  TEAM_ROSTERS_SQL,
  TP_POSITION_IDS_SQL,
  TP_SKILL_IDS_SQL,
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
  competitionId: id,
  competitionName: z.string(),
  teamId: id,
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
  lastingInjuriesNeverHeal: z.boolean(),
  cheapestCost: value.nullable(),
});

const timestamp = z
  .string()
  .refine((text) => !Number.isNaN(Date.parse(text)), 'not a timestamp');

const TeamPlayerRowSchema = z.object({
  playerId: id,
  teamId: id,
  eraId: id,
  positionId: id,
  playerName: z.string(),
  positionName: z.string(),
  sppTotal: value.nullable(),
  unspentSpp: value.nullable(),
  isJourneyman: z.boolean(),
  isIncomplete: z.boolean(),
});

const PaidAdvancementRowSchema = z.object({
  playerId: id,
  skillId: id.nullable(),
  attributeValue: z.string().nullable(),
  characteristic: z.enum(CHARACTERISTIC_KEYS).nullable(),
});

const TeamRosterRowSchema = z.object({
  teamId: id,
  rosterId: z.string().min(1),
});

const TpSkillIdRowSchema = z.object({
  skillId: id,
  masterId: z.string().min(1),
});

const TpPositionIdRowSchema = z.object({
  positionId: id,
  tpPositionId: z.string().min(1),
});

const SkillIdRowSchema = z.object({ skillId: id });

const SkillNameRowSchema = z.object({
  skillId: id,
  skillName: z.string(),
  nameId: z.string().min(1),
});

const SkillCategoryRowSchema = z.object({
  skillId: id,
  rulesSetId: id,
  category: z.enum(SKILL_CATEGORIES),
});

const PositionAccessRowSchema = z.object({
  positionId: id,
  rulesSetId: id,
  category: z.enum(SKILL_CATEGORIES),
  access: z.enum(SKILL_ACCESS_LEVELS),
});

const AdvancementCostRowSchema = z.object({
  eraId: id,
  rulesSetId: id,
  leagueId: id.nullable(),
  advancementNumber: value.positive(),
  advancementKind: z.enum(ADVANCEMENT_KINDS),
  skillId: id.nullable(),
  sppCost: value.positive(),
});

const StatReductionEventRowSchema = z.object({
  playerId: id,
  characteristic: z.enum(CHARACTERISTIC_KEYS),
  competitionId: id,
  playedAt: timestamp,
});

const TeamCompetitionRowSchema = z.object({
  playerId: id,
  competitionId: id,
  firstPlayedAt: timestamp,
  lastPlayedAt: timestamp,
});

const DeathTimeRowSchema = z.object({ playerId: id, diedAt: timestamp });

const BigGuyPositionRowSchema = z.object({ positionId: id, eraId: id });

const LineSchema = z.object({
  ma: value,
  st: value,
  ag: value,
  pa: value.nullable(),
  av: value,
});

const LastingInjuryRepairCandidateRowSchema = z.object({
  player: z.object({
    system: z.literal(TP_EXTERNAL_SYSTEM_NAME),
    id: z.string().min(1),
  }),
  line: LineSchema,
  increases: z.array(z.enum(CHARACTERISTIC_KEYS)),
  context: z
    .object({
      formats: z.object({
        ma: format,
        st: format,
        ag: format,
        pa: format,
        av: format,
      }),
      baseline: LineSchema.nullable(),
    })
    .nullable(),
});

/**
 * Reads what the fill planner needs from production, one read-only query
 * per kind of row, and validates every row before the planner sees it. The
 * rows cover the candidates and their stored data, team players (TP
 * players of the candidates' teams), their paid advancements and rosters,
 * skill names and categories, position access, advancement costs and
 * stat-reduction events, the competitions and death times that decide
 * whether they last, Big Guy positions, the TP ids of skills and candidate
 * positions, and the skills held with a variant; separately, the complete
 * players who may need a lasting-reduction repair.
 */
@Injectable()
export class IncompletePlayerFillQueriesService {
  constructor(private readonly json: ProductionJsonQueryService) {}

  async load(): Promise<FillPlannerRows> {
    const ongoing = await this.rows(ONGOING_COMPETITIONS_SQL, OngoingRowSchema);
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
      deathTimes: await this.rows(DEATH_TIMES_SQL, DeathTimeRowSchema),
      storedAdvancements: await this.rows(
        STORED_ADVANCEMENTS_SQL,
        StoredAdvancementRowSchema,
      ),
      freeSkillRiskPlayerIds: (
        await this.rows(FREE_SKILL_RISK_SQL, PlayerIdRowSchema)
      ).map((row) => row.playerId),
      ongoingTeamIds: [...new Set(ongoing.map((row) => row.teamId))],
      ongoingCompetitions: this.summarizeOngoing(ongoing),
      positionRulesSets: await this.rows(
        POSITION_RULES_SETS_SQL,
        PositionRulesSetRowSchema,
      ),
      positionSkills: await this.rows(
        POSITION_SKILLS_SQL,
        PositionSkillRowSchema,
      ),
      eraRulesSets: await this.rows(ERA_RULES_SETS_SQL, EraRulesSetRowSchema),
      teamPlayers: await this.rows(TEAM_PLAYERS_SQL, TeamPlayerRowSchema),
      teamRosters: await this.rows(TEAM_ROSTERS_SQL, TeamRosterRowSchema),
      paidAdvancements: await this.rows(
        PAID_ADVANCEMENTS_SQL,
        PaidAdvancementRowSchema,
      ),
      skillNames: await this.rows(SKILL_NAMES_SQL, SkillNameRowSchema),
      skillCategories: await this.rows(
        SKILL_CATEGORIES_SQL,
        SkillCategoryRowSchema,
      ),
      positionAccess: await this.rows(
        POSITION_ACCESS_SQL,
        PositionAccessRowSchema,
      ),
      advancementCosts: await this.rows(
        ADVANCEMENT_COSTS_SQL,
        AdvancementCostRowSchema,
      ),
      statReductionEvents: await this.rows(
        STAT_REDUCTION_EVENTS_SQL,
        StatReductionEventRowSchema,
      ),
      teamCompetitions: await this.rows(
        TEAM_COMPETITIONS_SQL,
        TeamCompetitionRowSchema,
      ),
      bigGuyPositions: await this.rows(
        BIG_GUY_POSITIONS_SQL,
        BigGuyPositionRowSchema,
      ),
      tpSkillIds: await this.rows(TP_SKILL_IDS_SQL, TpSkillIdRowSchema),
      tpPositionIds: await this.rows(
        TP_POSITION_IDS_SQL,
        TpPositionIdRowSchema,
      ),
      attributedSkillIds: (
        await this.rows(ATTRIBUTED_SKILLS_SQL, SkillIdRowSchema)
      ).map((row) => row.skillId),
    };
  }

  /**
   * The complete TP players who may need a lasting-reduction repair, with
   * what the server derives their reductions from.
   */
  async loadLastingInjuryRepairCandidates(): Promise<
    LastingInjuryRepairCandidate[]
  > {
    return this.rows(
      LASTING_INJURY_REPAIRS_SQL,
      LastingInjuryRepairCandidateRowSchema,
    );
  }

  private async rows<T extends z.ZodType>(
    sql: string,
    schema: T,
  ): Promise<z.infer<T>[]> {
    return z.array(schema).parse(await this.json.rows(sql));
  }

  /**
   * One summary per ongoing competition, counting its distinct teams (the
   * query's rows are distinct per competition and team), ordered by name
   * and then id so same-named competitions stay apart.
   */
  private summarizeOngoing(
    rows: readonly z.infer<typeof OngoingRowSchema>[],
  ): OngoingCompetitionSummary[] {
    const byId = new Map<number, OngoingCompetitionSummary>();
    for (const row of rows) {
      const summary = byId.get(row.competitionId) ?? {
        competitionId: row.competitionId,
        name: row.competitionName,
        teamCount: 0,
      };
      summary.teamCount += 1;
      byId.set(row.competitionId, summary);
    }
    return [...byId.values()].sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.competitionId - b.competitionId,
    );
  }
}

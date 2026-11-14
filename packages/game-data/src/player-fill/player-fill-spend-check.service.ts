import type { Db } from '@blood-bowl-tracker/db';
import { and, DB, inArray, skillRulesSets } from '@blood-bowl-tracker/db';
import type { SkillCategory } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import type { SpendCheckOrder } from '../spp/advancement-order-spend-check.service';
import { AdvancementOrderSpendCheckService } from '../spp/advancement-order-spend-check.service';
import { UnspentSppService } from '../spp/unspent-spp.service';
import type {
  PlayerSkillEntry as AdvancementRow,
  RulesSetAdvancementInput,
} from '../spp/unspent-spp.types';
import type { PlannedFillRow } from './player-fill.types';

export interface PlayerFillSpendInput {
  playerId: number;
  planned: PlannedFillRow[];
  sppTotal: number;
  unspentSpp: number;
}

/**
 * Checks a fill's advancements against the SPP it reports as spent (total
 * minus unspent) before anything is written, the same check a curated
 * advancement order gets (AdvancementOrderSpendCheckService), with the
 * listed order as the only one allowed. The rows are not stored yet, so the
 * pricing inputs of the player's era (UnspentSppService) get the planned
 * rows, under ids 1 to n, in place of his stored ones, and the categories of
 * the planned skills under each of those rules sets. A problem reads after
 * the player's name.
 */
@Injectable()
export class PlayerFillSpendCheckService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly unspentSpp: UnspentSppService,
    private readonly spendCheck: AdvancementOrderSpendCheckService,
  ) {}

  async problem(input: PlayerFillSpendInput): Promise<string | undefined> {
    const reported = this.spendCheck.reportedSpend(input);
    if (reported.kind !== 'spent') {
      // Both figures are given, so reportedSpend never answers 'unknown' here.
      return reported.kind === 'inconsistent' ? reported.problem : undefined;
    }
    const rows = input.planned.map((row, at): AdvancementRow => ({
      id: at + 1,
      skillId: row.skillId,
      source: row.source,
      isFreeExtra: row.isFreeExtra,
      advancementOrder: null,
      orderConfirmed: false,
    }));
    const order: SpendCheckOrder = {
      playerId: input.playerId,
      rowIdsInOrder: rows
        .filter((_row, at) => input.planned[at].paidNumber !== null)
        .map((row) => row.id),
      freeRowIds: new Set(
        rows.filter((row) => row.isFreeExtra).map((row) => row.id),
      ),
      spent: reported.spent,
    };
    return this.spendCheck.plannedSpendProblem(
      order,
      await this.rulesSetInputs(input.playerId, rows),
    );
  }

  /** The era's pricing inputs with the planned rows and their categories. */
  private async rulesSetInputs(
    playerId: number,
    rows: AdvancementRow[],
  ): Promise<RulesSetAdvancementInput[]> {
    const stored =
      (await this.unspentSpp.advancementInputsForPlayers([playerId])).get(
        playerId,
      ) ?? [];
    const skillIds = [
      ...new Set(
        rows.flatMap((row) => (row.skillId === null ? [] : [row.skillId])),
      ),
    ];
    const rulesSetIds = stored.map((input) => input.rulesSetId);
    const categoryRows =
      skillIds.length === 0 || rulesSetIds.length === 0
        ? []
        : await this.db
            .select({
              skillId: skillRulesSets.skillId,
              rulesSetId: skillRulesSets.rulesSetId,
              category: skillRulesSets.category,
            })
            .from(skillRulesSets)
            .where(
              and(
                inArray(skillRulesSets.skillId, skillIds),
                inArray(skillRulesSets.rulesSetId, rulesSetIds),
              ),
            );
    return stored.map((input) => ({
      ...input,
      candidatesInput: {
        ...input.candidatesInput,
        skills: rows,
        skillCategories: new Map<number, SkillCategory>(
          categoryRows
            .filter((row) => row.rulesSetId === input.rulesSetId)
            .map((row) => [row.skillId, row.category]),
        ),
      },
    }));
  }
}

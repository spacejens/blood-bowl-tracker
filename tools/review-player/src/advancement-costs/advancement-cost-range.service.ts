import type {
  AdvancementKind,
  PlayerSkillSource,
} from '@blood-bowl-tracker/domain-enums';
import { ADVANCEMENT_KINDS } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  AdvancementHistory,
  ApplicableCost,
  CandidateCost,
  FigurePlacement,
  ModelledAdvancement,
  ModelledRange,
  StoredIncreaseCounts,
  StoredPlayerSkill,
  UnspentSppModel,
} from './advancement-cost-model.types';

/** The skill kinds a gained skill's stored source allows. */
const SKILL_KINDS: Readonly<
  Record<PlayerSkillSource, readonly AdvancementKind[]>
> = {
  starting: [],
  advancement: [
    'random_primary_skill',
    'chosen_primary_skill',
    'random_secondary_skill',
    'chosen_secondary_skill',
  ],
  chosen: ['chosen_primary_skill', 'chosen_secondary_skill'],
  random: ['random_primary_skill', 'random_secondary_skill'],
};

/** Increase-count columns and the label BBL itself uses for each. */
const INCREASES: readonly (readonly [keyof StoredIncreaseCounts, string])[] = [
  ['move', '+MA'],
  ['strength', '+ST'],
  ['agility', '+AG'],
  ['passing', '+PA'],
  ['armour', '+AV'],
];

/**
 * Prices a player's stored advancements against `advancement_costs`, for the
 * review. Re-implemented here rather than taken from `packages/game-data`,
 * whose derivation is what the review checks, and deliberately coarser: the
 * range takes, per advancement number, the cheapest and dearest cost of any
 * kind any of the player's paid advancements could be. That holds for every
 * order and every kind assignment, so a source figure outside it is a real
 * disagreement while a figure inside proves nothing. Primary versus
 * secondary is not narrowed.
 *
 * Starting skills and a skill one of the player's own trophy awards granted
 * cost nothing and take no number. A skill a `granted_skill` row names (a
 * league house rule) takes that row's number and cost. Every other gained
 * skill and every characteristic increase takes the next free number in
 * display order; that number is illustrative only, because the stored skill
 * order is unverified and increases have none.
 */
@Injectable()
export class AdvancementCostRangeService {
  model(history: AdvancementHistory): UnspentSppModel {
    const fixedThresholds = this.isFixedThresholds(history.costs);
    const rows =
      history.rulesSet === null ? [] : this.rows(history, fixedThresholds);
    const base: Omit<UnspentSppModel, 'unknownReason'> = {
      rulesSetName: history.rulesSet?.name ?? null,
      fixedThresholds,
      rows,
      totalSpp: history.sppTotal,
      range: null,
    };
    if (history.isStarPlayer) {
      return { ...base, unknownReason: 'star_player' };
    }
    if (history.sppTotal === null) {
      return { ...base, unknownReason: 'no_total_spp' };
    }
    if (history.rulesSet === null) {
      return { ...base, unknownReason: 'no_rules_set' };
    }
    if (history.costs.length === 0) {
      return { ...base, unknownReason: 'no_costs' };
    }
    const spend = this.spend(history.costs, rows, fixedThresholds);
    if (spend === null) {
      return { ...base, unknownReason: 'unpriced_advancement' };
    }
    return {
      ...base,
      range: {
        ...spend,
        unspentMin: history.sppTotal - spend.spentMax,
        unspentMax: history.sppTotal - spend.spentMin,
      },
      unknownReason: null,
    };
  }

  placement(figure: number, range: ModelledRange): FigurePlacement {
    if (figure < range.unspentMin) {
      return 'below';
    }
    return figure > range.unspentMax ? 'above' : 'inside';
  }

  private isFixedThresholds(costs: readonly ApplicableCost[]): boolean {
    const own = costs.filter((c) => c.advancementKind !== 'granted_skill');
    return (
      own.length > 0 && own.every((c) => c.advancementKind === 'table_roll')
    );
  }

  private rows(
    history: AdvancementHistory,
    fixedThresholds: boolean,
  ): ModelledAdvancement[] {
    const entries = [
      ...history.skills.map((skill) => this.skillEntry(skill, history)),
      ...this.increaseEntries(history.increaseCounts),
    ];
    const reserved = new Set(
      entries.flatMap((entry) =>
        entry.kind === 'granted' && entry.advancementNumber !== null
          ? [entry.advancementNumber]
          : [],
      ),
    );
    let next = 1;
    return entries.map((entry) => {
      if (entry.kind !== 'skill' && entry.kind !== 'characteristic') {
        return entry;
      }
      while (reserved.has(next)) {
        next += 1;
      }
      const advancementNumber = next;
      next += 1;
      return {
        ...entry,
        advancementNumber,
        candidates: this.costsAt(
          history.costs,
          advancementNumber,
          this.kindsFor(entry, fixedThresholds),
        ),
      };
    });
  }

  private skillEntry(
    skill: StoredPlayerSkill,
    history: AdvancementHistory,
  ): ModelledAdvancement {
    const row: Omit<ModelledAdvancement, 'kind'> = {
      label: skill.skillName,
      storedSource: skill.source,
      advancementNumber: null,
      candidates: [],
    };
    if (skill.source === 'starting') {
      return { ...row, kind: 'starting' };
    }
    if (history.trophyGrantedSkillIds.has(skill.skillId)) {
      return { ...row, kind: 'trophy' };
    }
    const granting = history.costs.find(
      (c) =>
        c.advancementKind === 'granted_skill' && c.skillId === skill.skillId,
    );
    if (granting !== undefined) {
      return {
        ...row,
        kind: 'granted',
        advancementNumber: granting.advancementNumber,
        candidates: [
          { advancementKind: 'granted_skill', sppCost: granting.sppCost },
        ],
      };
    }
    return { ...row, kind: 'skill' };
  }

  private increaseEntries(counts: StoredIncreaseCounts): ModelledAdvancement[] {
    return INCREASES.flatMap(([key, label]) =>
      Array.from({ length: counts[key] }, (): ModelledAdvancement => ({
        label,
        kind: 'characteristic',
        storedSource: null,
        advancementNumber: null,
        candidates: [],
      })),
    );
  }

  private kindsFor(
    row: ModelledAdvancement,
    fixedThresholds: boolean,
  ): readonly AdvancementKind[] {
    if (row.kind === 'characteristic') {
      return fixedThresholds ? ['table_roll'] : ['random_characteristic'];
    }
    if (row.kind === 'skill' && row.storedSource !== null) {
      return fixedThresholds ? ['table_roll'] : SKILL_KINDS[row.storedSource];
    }
    return [];
  }

  private costsAt(
    costs: readonly ApplicableCost[],
    advancementNumber: number,
    kinds: readonly AdvancementKind[],
  ): CandidateCost[] {
    return costs
      .filter(
        (c) =>
          c.advancementNumber === advancementNumber &&
          kinds.includes(c.advancementKind),
      )
      .sort(
        (a, b) =>
          ADVANCEMENT_KINDS.indexOf(a.advancementKind) -
          ADVANCEMENT_KINDS.indexOf(b.advancementKind),
      )
      .map(({ advancementKind, sppCost }) => ({ advancementKind, sppCost }));
  }

  /** Least and most spent, or null when a paid number has no cost at all. */
  private spend(
    costs: readonly ApplicableCost[],
    rows: readonly ModelledAdvancement[],
    fixedThresholds: boolean,
  ): { spentMin: number; spentMax: number } | null {
    const kinds = [
      ...new Set(rows.flatMap((row) => this.kindsFor(row, fixedThresholds))),
    ];
    let spentMin = 0;
    let spentMax = 0;
    for (const row of rows) {
      if (row.kind === 'granted') {
        const fixed = row.candidates.reduce((sum, c) => sum + c.sppCost, 0);
        spentMin += fixed;
        spentMax += fixed;
      } else if (row.advancementNumber !== null) {
        const fitting = this.costsAt(costs, row.advancementNumber, kinds).map(
          (c) => c.sppCost,
        );
        if (fitting.length === 0) {
          return null;
        }
        spentMin += Math.min(...fitting);
        spentMax += Math.max(...fitting);
      }
    }
    return { spentMin, spentMax };
  }
}

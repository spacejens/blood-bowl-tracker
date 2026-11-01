import type {
  AdvancementKind,
  PlayerSkillSource,
  SkillAccess,
} from '@blood-bowl-tracker/domain-enums';
import { ADVANCEMENT_KINDS } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  AdvancementHistory,
  ApplicableCost,
  CandidateCost,
  ModelledAdvancement,
  StoredIncrease,
  StoredPlayerSkill,
  UnspentSppModel,
} from './advancement-cost-model.types';

/** The kinds a gained skill's stored source allows, when priced by kind. */
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
  characteristic: [],
};

/** The skill kinds a skill of a primary or a secondary category can cost. */
const ACCESS_KINDS: Readonly<Record<SkillAccess, readonly AdvancementKind[]>> =
  {
    primary: ['random_primary_skill', 'chosen_primary_skill'],
    secondary: ['random_secondary_skill', 'chosen_secondary_skill'],
  };

/** A row and the kinds its cost may be of; none for a free or fixed row. */
interface PricedRow {
  row: ModelledAdvancement;
  kinds: readonly AdvancementKind[];
  /** The confirmed number this row must take; absent when not confirmed. */
  pinned?: number;
}

/**
 * Prices a player's stored advancements against `advancement_costs`, for the
 * review. Re-implemented here rather than taken from `packages/game-data`,
 * whose derivation is what the review checks, and deliberately coarser: the
 * range takes, per advancement number, the cheapest and dearest cost of any
 * kind any of the player's paid advancements could be. That holds for every
 * order and every kind assignment, so a source's spend outside it is a real
 * disagreement while a spend inside proves nothing.
 *
 * Under a kind-priced rules set a gained skill's kinds follow its stored
 * source (random, chosen, or either) and its category under the rules set: a
 * category the position has as primary allows only the primary kinds, one it
 * has as secondary only the secondary kinds (primary wins when both are
 * recorded), and a category it has neither way, or one that is not recorded,
 * allows both. A characteristic roll taken as a skill is not modelled, so a
 * skill is never priced as a `random_characteristic`.
 *
 * Starting skills and a skill stored as a free extra (a gained Hatred, a skill
 * TP flags as extra, a skill a trophy award granted) cost nothing and take
 * no number. A skill a `granted_skill` row names (a league house rule) takes
 * that row's number and cost, and a characteristic increase whose stored order
 * is confirmed takes that order, as the server's cost model pins it. Every
 * other gained skill and characteristic increase takes the next number not
 * already taken, in their stored order with skills and increases in one
 * sequence (unknown orders last, skills before increases); that number is
 * illustrative only.
 */
@Injectable()
export class AdvancementCostRangeService {
  model(history: AdvancementHistory): UnspentSppModel {
    const fixedThresholds = this.isFixedThresholds(history.costs);
    const priced =
      history.rulesSet === null ? [] : this.priced(history, fixedThresholds);
    const rows = priced.map((entry) => entry.row);
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
    const spend = this.spend(history.costs, priced);
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

  /** True when every one of the rules set's own costs is a `table_roll`. */
  private isFixedThresholds(costs: readonly ApplicableCost[]): boolean {
    // A league's house-rule rows are not the rules set's own costs.
    const own = costs.filter((c) => c.leagueId === null);
    return (
      own.length > 0 && own.every((c) => c.advancementKind === 'table_roll')
    );
  }

  private priced(
    history: AdvancementHistory,
    fixedThresholds: boolean,
  ): PricedRow[] {
    const sequenced = [
      ...history.skills.map((skill) => ({
        order: skill.source === 'starting' ? -1 : skill.advancementOrder,
        entry: this.skillEntry(skill, history, fixedThresholds),
      })),
      ...history.increases.map((increase) => ({
        order: increase.advancementOrder,
        entry: this.increaseEntry(increase, fixedThresholds),
      })),
    ];
    // A stable sort: starting skills first, then by order with unknown ones
    // last; ties keep skills before increases because skills are listed first.
    const entries = [...sequenced]
      .sort(
        (a, b) =>
          (a.order ?? Number.MAX_SAFE_INTEGER) -
          (b.order ?? Number.MAX_SAFE_INTEGER),
      )
      .map(({ entry }) => entry);
    const reserved = new Set(
      entries.flatMap(({ row, pinned }) => {
        if (pinned !== undefined) {
          return [pinned];
        }
        return row.kind === 'granted' && row.advancementNumber !== null
          ? [row.advancementNumber]
          : [];
      }),
    );
    let next = 1;
    const nextFree = (): number => {
      while (reserved.has(next)) {
        next += 1;
      }
      next += 1;
      return next - 1;
    };
    return entries.map((entry) => {
      if (entry.row.kind !== 'skill' && entry.row.kind !== 'characteristic') {
        return entry;
      }
      const advancementNumber = entry.pinned ?? nextFree();
      return {
        ...entry,
        row: {
          ...entry.row,
          advancementNumber,
          candidates: this.costsAt(
            history.costs,
            advancementNumber,
            entry.kinds,
          ),
        },
      };
    });
  }

  private skillEntry(
    skill: StoredPlayerSkill,
    history: AdvancementHistory,
    fixedThresholds: boolean,
  ): PricedRow {
    const row: Omit<ModelledAdvancement, 'kind'> = {
      label: skill.skillName,
      storedSource: skill.source,
      advancementNumber: null,
      candidates: [],
    };
    if (skill.source === 'starting') {
      return { row: { ...row, kind: 'starting' }, kinds: [] };
    }
    if (skill.isFreeExtra) {
      return { row: { ...row, kind: 'free_extra' }, kinds: [] };
    }
    const granting = history.costs.find(
      (c) =>
        c.advancementKind === 'granted_skill' && c.skillId === skill.skillId,
    );
    if (granting !== undefined) {
      return {
        row: {
          ...row,
          kind: 'granted',
          advancementNumber: granting.advancementNumber,
          candidates: [
            { advancementKind: 'granted_skill', sppCost: granting.sppCost },
          ],
        },
        kinds: [],
      };
    }
    return {
      row: { ...row, kind: 'skill' },
      kinds: fixedThresholds ? ['table_roll'] : this.skillKinds(skill, history),
    };
  }

  /** The source's kinds, narrowed to the position's access to the category. */
  private skillKinds(
    skill: StoredPlayerSkill,
    history: AdvancementHistory,
  ): readonly AdvancementKind[] {
    const allowed = SKILL_KINDS[skill.source];
    const access = this.access(skill, history);
    return access === null
      ? allowed
      : allowed.filter((kind) => ACCESS_KINDS[access].includes(kind));
  }

  /** Primary wins over secondary; null when neither applies or is recorded. */
  private access(
    skill: StoredPlayerSkill,
    history: AdvancementHistory,
  ): SkillAccess | null {
    if (skill.category === null) {
      return null;
    }
    if (history.primaryCategories.has(skill.category)) {
      return 'primary';
    }
    if (history.secondaryCategories.has(skill.category)) {
      return 'secondary';
    }
    return null;
  }

  private increaseEntry(
    increase: StoredIncrease,
    fixedThresholds: boolean,
  ): PricedRow {
    return {
      row: {
        label: `+${increase.characteristic}`,
        kind: 'characteristic',
        storedSource: null,
        advancementNumber: null,
        candidates: [],
        increaseOrder: {
          known: increase.advancementOrder !== null,
          confirmed: increase.orderConfirmed,
        },
      },
      kinds: fixedThresholds ? ['table_roll'] : ['random_characteristic'],
      ...(increase.orderConfirmed && increase.advancementOrder !== null
        ? { pinned: increase.advancementOrder }
        : {}),
    };
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
    priced: readonly PricedRow[],
  ): { spentMin: number; spentMax: number } | null {
    const kinds = [...new Set(priced.flatMap((entry) => entry.kinds))];
    let spentMin = 0;
    let spentMax = 0;
    for (const { row } of priced) {
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

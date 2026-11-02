import type {
  AdvancementKind,
  PlayerSkillSource,
  SkillAccess,
} from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  AdvancementCandidatesInput,
  AdvancementOption,
  PlayerSkillEntry,
} from './unspent-spp.types';

/** A row that names a skill. */
type SkillAdvancement = PlayerSkillEntry & { skillId: number };

/**
 * Turns a player's recorded advancements into the options each one could
 * have been under one rules set, for AdvancementSpendRangeService to price.
 *
 * - Starting skills and free extra skills (a gained Hatred, a skill TP flags
 *   as extra, a skill one of the player's own trophy awards granted) are not
 *   advancements and are skipped.
 * - A skill that a cost row grants (`granted_skill`, a league house rule such
 *   as Fan Favourite) can only be that row's advancement.
 * - Any other gained skill is a skill advancement of any number. Its source
 *   narrows random against chosen (`advancement` allows both). The position's
 *   access to the skill's category narrows primary against secondary; no
 *   access, or no recorded category, allows both. Under fixed thresholds it
 *   is a `table_roll`.
 * - A characteristic increase arrives as a `characteristic` row and is a
 *   `random_characteristic`, or a `table_roll` under fixed thresholds, of any
 *   number.
 *
 * Kinds the cost rows do not price at all are dropped (BB2025 has no random
 * secondary skill; a fixed-threshold rules set prices only table rolls), so
 * an entry can end up empty. An entry whose order is confirmed is pinned to
 * the advancement number it records, and an option already tied to another
 * number is dropped. An unconfirmed `advancementOrder` is an unverified
 * proxy, so that entry's order is treated as unknown.
 */
@Injectable()
export class AdvancementKindCandidatesService {
  candidates(input: AdvancementCandidatesInput): AdvancementOption[][] {
    const offered = new Set<AdvancementKind>(
      input.costs
        .filter((cost) => cost.advancementKind !== 'granted_skill')
        .map((cost) => cost.advancementKind),
    );
    const result: AdvancementOption[][] = [];
    for (const entry of input.skills) {
      if (entry.source === 'starting' || entry.isFreeExtra) {
        continue;
      }
      const options =
        entry.source === 'characteristic' || entry.skillId === null
          ? this.anyNumber(['random_characteristic', 'table_roll'], offered)
          : this.skillOptions(
              { ...entry, skillId: entry.skillId },
              input,
              offered,
            );
      result.push(this.pinned(options, entry));
    }
    return result;
  }

  /**
   * A confirmed entry can only be the advancement its recorded order names; an
   * option already tied to another number (a granted skill) cannot fit it.
   */
  private pinned(
    options: AdvancementOption[],
    entry: PlayerSkillEntry,
  ): AdvancementOption[] {
    if (!entry.orderConfirmed || entry.advancementOrder === null) {
      return options;
    }
    const advancementNumber = entry.advancementOrder;
    return options
      .filter(
        (option) =>
          option.advancementNumber === null ||
          option.advancementNumber === advancementNumber,
      )
      .map((option) => ({ ...option, advancementNumber }));
  }

  private skillOptions(
    skill: SkillAdvancement,
    input: AdvancementCandidatesInput,
    offered: ReadonlySet<AdvancementKind>,
  ): AdvancementOption[] {
    const granting = input.costs.filter(
      (cost) =>
        cost.advancementKind === 'granted_skill' &&
        cost.skillId === skill.skillId,
    );
    if (granting.length > 0) {
      return granting.map((cost): AdvancementOption => ({
        advancementKind: 'granted_skill',
        advancementNumber: cost.advancementNumber,
      }));
    }
    const category = input.skillCategories.get(skill.skillId);
    const access =
      category === undefined ? undefined : input.positionAccess.get(category);
    return this.anyNumber(
      [...this.skillKinds(skill.source, access), 'table_roll'],
      offered,
    );
  }

  private skillKinds(
    source: PlayerSkillSource,
    access: SkillAccess | undefined,
  ): AdvancementKind[] {
    const random = source !== 'chosen';
    const chosen = source !== 'random';
    const primary = access !== 'secondary';
    const secondary = access !== 'primary';
    const kinds: AdvancementKind[] = [];
    if (primary && random) kinds.push('random_primary_skill');
    if (primary && chosen) kinds.push('chosen_primary_skill');
    if (secondary && random) kinds.push('random_secondary_skill');
    if (secondary && chosen) kinds.push('chosen_secondary_skill');
    return kinds;
  }

  private anyNumber(
    kinds: AdvancementKind[],
    offered: ReadonlySet<AdvancementKind>,
  ): AdvancementOption[] {
    return kinds
      .filter((kind) => offered.has(kind))
      .map((advancementKind) => ({ advancementKind, advancementNumber: null }));
  }
}

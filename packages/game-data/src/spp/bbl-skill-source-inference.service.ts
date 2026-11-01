import type { UnspentSppSnapshot } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { and, DB, eq, or, playerSkills } from '@blood-bowl-tracker/db';
import type { PlayerSkillSource } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import { UnspentSppService } from './unspent-spp.service';
import type {
  AdvancementCandidatesInput,
  ApplicableAdvancementCost,
  RulesSetAdvancementInput,
} from './unspent-spp.types';

/** A source that says how a gained skill was gained. */
type SettledSource = Extract<PlayerSkillSource, 'chosen' | 'random'>;

/** Written in this order, so a run's UPDATEs come in a fixed sequence. */
const SETTLED_SOURCES: readonly SettledSource[] = ['chosen', 'random'];

/** One player's skill, as the write matches it. */
interface PlayerSkillKey {
  playerId: number;
  skillId: number;
}

/**
 * Works out whether a BBL player's gained skills were chosen or rolled.
 *
 * BBL's player page does not say, so the BBL import records every gained
 * skill as `advancement`. Its "Unspent SPP" row does give the SPP BBL counts
 * as spent: the bracketed career total less the unspent figure. Under rules
 * sets that price an advancement by its kind, that spend can leave only one
 * answer. For each rules set of the player's era whose costs reach the spend
 * exactly, each `advancement` skill is tried as `random` and as `chosen`
 * (AdvancementKindCandidatesService lists the options,
 * AdvancementSpendRangeService checks the exact total). A skill is rewritten
 * only when one source fits and the other does not, in every rules set that
 * fits. Interchangeable skills that could swap stay `advancement`, as do
 * skills of a player whose spend fits no rules set, and every skill when the
 * era only prices by fixed thresholds.
 *
 * BBL prices every advancement at BB2020 costs, so its spend is matched
 * against each rules set's own cost table: BBL's kind-priced eras (BB2020,
 * DB2021) use exactly those costs.
 *
 * Only rows still recorded `advancement` are written, so a starting skill or
 * a source already recorded `chosen` or `random` is never changed. The BBL
 * import re-sends every gained skill as `advancement`, but
 * PlayerSkillsService keeps a settled source against that generic value, so
 * a skill settled once stays settled and later imports only work on the
 * skills still open, with the settled ones as fixed constraints.
 */
@Injectable()
export class BblSkillSourceInferenceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly unspentSpp: UnspentSppService,
    private readonly candidates: AdvancementKindCandidatesService,
    private readonly spendRange: AdvancementSpendRangeService,
  ) {}

  /** `snapshots` is each player's BBL unspent figure and its career total. */
  async inferSources(
    snapshots: ReadonlyMap<number, UnspentSppSnapshot>,
  ): Promise<void> {
    // The first two bounds UnspentSppDecisionService.trusted puts on a figure
    // before storing it: a negative unspent figure, or one above the career
    // total it sits beside, is not a spend to reason from. Its third check,
    // that the snapshot's total is the total stored, is left out on purpose:
    // the spend is worked out inside the page's own snapshot, so the stored
    // total plays no part in it.
    const usable = [...snapshots].filter(
      ([, { unspentSpp, snapshotSppTotal }]) =>
        unspentSpp >= 0 && unspentSpp <= snapshotSppTotal,
    );
    if (usable.length === 0) {
      return;
    }
    const inputs = await this.unspentSpp.advancementInputsForPlayers(
      usable.map(([playerId]) => playerId),
    );
    const settled = new Map<SettledSource, PlayerSkillKey[]>();
    for (const [playerId, snapshot] of usable) {
      const rulesSets = inputs.get(playerId) ?? [];
      const spent = snapshot.snapshotSppTotal - snapshot.unspentSpp;
      // A source is only settled on the evidence of a kind-priced rules set
      // that fits the spend. Every other fitting set, a fixed-threshold one or
      // one holding only a league's house rules, can only keep a skill open.
      const hasFittingKindPriced = rulesSets.some(
        ({ candidatesInput, costs, pricingModel }) =>
          pricingModel === 'kind_priced' &&
          this.fits(candidatesInput, costs, spent),
      );
      if (!hasFittingKindPriced) {
        continue;
      }
      for (const [skillId, source] of this.settledSources(rulesSets, spent)) {
        let keys = settled.get(source);
        if (keys === undefined) {
          keys = [];
          settled.set(source, keys);
        }
        keys.push({ playerId, skillId });
      }
    }
    await this.write(settled);
  }

  /** Each `advancement` skill id whose source only one answer fits. */
  private settledSources(
    rulesSets: RulesSetAdvancementInput[],
    spent: number,
  ): Map<number, SettledSource> {
    const possible = new Map<number, Set<SettledSource>>();
    for (const { candidatesInput, costs } of rulesSets) {
      if (!this.fits(candidatesInput, costs, spent)) {
        continue;
      }
      candidatesInput.skills.forEach((skill, index) => {
        if (skill.source !== 'advancement') {
          return;
        }
        const sources = possible.get(skill.skillId) ?? new Set();
        for (const source of SETTLED_SOURCES) {
          const forced = this.withSource(candidatesInput, index, source);
          if (this.fits(forced, costs, spent)) {
            sources.add(source);
          }
        }
        possible.set(skill.skillId, sources);
      });
    }
    const settled = new Map<number, SettledSource>();
    for (const [skillId, sources] of possible) {
      if (sources.size === 1) {
        settled.set(skillId, [...sources][0]);
      }
    }
    return settled;
  }

  private fits(
    input: AdvancementCandidatesInput,
    costs: ApplicableAdvancementCost[],
    spent: number,
  ): boolean {
    return this.spendRange.canSpendExactly(
      this.candidates.candidates(input),
      costs,
      spent,
    );
  }

  /** The input with the skill at `index` recorded as `source`. */
  private withSource(
    input: AdvancementCandidatesInput,
    index: number,
    source: SettledSource,
  ): AdvancementCandidatesInput {
    return {
      ...input,
      skills: input.skills.map((skill, at) =>
        at === index ? { ...skill, source } : skill,
      ),
    };
  }

  /** One UPDATE per source, in one transaction, only on `advancement` rows. */
  private async write(
    settled: ReadonlyMap<SettledSource, PlayerSkillKey[]>,
  ): Promise<void> {
    const groups = SETTLED_SOURCES.flatMap((source) => {
      const keys = settled.get(source) ?? [];
      return keys.length === 0 ? [] : [{ source, keys }];
    });
    if (groups.length === 0) {
      return;
    }
    await this.db.transaction(async (tx) => {
      for (const { source, keys } of groups) {
        await tx
          .update(playerSkills)
          .set({ source })
          .where(
            and(
              eq(playerSkills.source, 'advancement'),
              or(
                ...keys.map((key) =>
                  and(
                    eq(playerSkills.playerId, key.playerId),
                    eq(playerSkills.skillId, key.skillId),
                  ),
                ),
              ),
            ),
          );
      }
    });
  }
}

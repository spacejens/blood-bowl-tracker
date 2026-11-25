import { ReportedAdvancementPricingService } from '@blood-bowl-tracker/game-rules';
import { Injectable } from '@nestjs/common';

import type { TpFeedHistoryReport } from '../read-tp-feed-history/tp-feed-history-index.service';
import { MAX_PAID_ADVANCEMENTS } from './advancement-fill-stage.service';
import { FeedSkillResolverService } from './feed-skill-resolver.service';
import type {
  FeedFit,
  FeedOwner,
  PaidAdvancementRow,
  ResolvedStep,
  SkillNameRow,
} from './fill-plan.types';

export interface FeedFitInput {
  owner: FeedOwner;
  /** The reports he would own, oldest first. */
  reports: readonly TpFeedHistoryReport[];
  skillNames: readonly SkillNameRow[];
}

/**
 * Whether one stored player can own a list of feed reports, by what
 * AdvancementFillStageService requires of a feed-matched player: at most six
 * reports, each priced in order as his first advancements. This assumes the
 * cost of an advancement kind never falls as the advancement number rises,
 * which holds for every cost row stored today. A shown cost below its price
 * rules him out: an earlier report the feed lacks would only move the
 * reports to later advancement numbers, whose costs never fall. A shown
 * cost above its price may mean such a gap. The shown costs must not exceed
 * his total minus his unspent SPP (the SPP he spent). When the prices add
 * up to exactly that, every shown cost is its price, and he has paid
 * advancements stored, the reports must be exactly those advancements. When
 * a shown cost is above its price, or the prices add up to less than he
 * spent, the feed may lack a report, so the fit is `unknown`, unless he has
 * paid advancements stored and a report is not among them, which rules him
 * out. Those comparisons with his stored paid advancements rule out only a
 * complete player, whose stored advancements are all he has; an incomplete
 * player's may be partial, so for him they give `unknown` instead. No
 * reports always fit. A check that cannot be decided (SPP not
 * stored, a skill not resolved, reports not priced, a possible gap in the
 * feed) gives `unknown`, so it never rules a split in or out.
 *
 * Pure decision logic, with no I/O; its collaborators are pure as well.
 */
@Injectable()
export class FeedOwnerFitService {
  constructor(
    private readonly skills: FeedSkillResolverService,
    private readonly pricing: ReportedAdvancementPricingService,
  ) {}

  fit(input: FeedFitInput): FeedFit {
    const { owner, reports } = input;
    if (reports.length === 0) {
      return 'valid';
    }
    if (reports.length > MAX_PAID_ADVANCEMENTS) {
      return 'invalid';
    }
    if (owner.sppTotal === null || owner.unspentSpp === null) {
      return 'unknown';
    }
    const steps = this.skills.resolve({
      reports,
      skillNames: input.skillNames,
    });
    if (steps === undefined) {
      return 'unknown';
    }
    const outcome = this.pricing.price({ steps, rulesSets: owner.rulesSets });
    if (outcome.kind !== 'priced') {
      return 'unknown';
    }
    // The reports are priced as his first advancements. A report the feed
    // lacks before them would only move them to later, never cheaper,
    // advancement numbers, so a shown cost below its price rules him out.
    if (steps.some((step, at) => step.reportedCost < outcome.stepCosts[at])) {
      return 'invalid';
    }
    // The shown costs are what he paid for these advancements, at least the
    // prices, so they alone must fit within the SPP he spent.
    const spent = owner.sppTotal - owner.unspentSpp;
    const shownTotal = steps.reduce((sum, step) => sum + step.reportedCost, 0);
    if (shownTotal > spent) {
      return 'invalid';
    }
    const earlierGap = steps.some(
      (step, at) => step.reportedCost > outcome.stepCosts[at],
    );
    if (outcome.total === spent && !earlierGap) {
      return owner.paid.length === 0 || this.samePaid(steps, owner.paid)
        ? 'valid'
        : this.paidMismatch(owner);
    }
    // The feed may lack a report: an earlier one when a shown cost is above
    // its price, a later one when the reports cost less than he spent.
    if (owner.paid.length === 0) {
      return 'unknown';
    }
    return this.withinPaid(steps, owner.paid)
      ? 'unknown'
      : this.paidMismatch(owner);
  }

  /**
   * The fit when the reports disagree with his stored paid advancements: a
   * complete player's are all he has, but an incomplete player's are being
   * reconstructed and may be partial.
   */
  private paidMismatch(owner: FeedOwner): FeedFit {
    return owner.isIncomplete ? 'unknown' : 'invalid';
  }

  /** Whether the steps are exactly the stored paid advancements, in any order. */
  private samePaid(
    steps: readonly ResolvedStep[],
    paid: readonly PaidAdvancementRow[],
  ): boolean {
    const { reported, stored } = this.keys(steps, paid);
    return (
      JSON.stringify(reported.sort(this.byText)) ===
      JSON.stringify(stored.sort(this.byText))
    );
  }

  /** Whether every step is one of the stored paid advancements, counting repeats. */
  private withinPaid(
    steps: readonly ResolvedStep[],
    paid: readonly PaidAdvancementRow[],
  ): boolean {
    const { reported, stored } = this.keys(steps, paid);
    return reported.every((key) => {
      const at = stored.indexOf(key);
      if (at === -1) {
        return false;
      }
      stored.splice(at, 1);
      return true;
    });
  }

  private keys(
    steps: readonly ResolvedStep[],
    paid: readonly PaidAdvancementRow[],
  ): { reported: string[]; stored: string[] } {
    const reported = steps.map((step) =>
      step.kind === 'characteristic'
        ? this.characteristicKey(step.characteristic)
        : this.skillKey(step.skillId, step.attributeValue),
    );
    const stored = paid.map((row) =>
      row.characteristic === null
        ? this.skillKey(row.skillId, row.attributeValue)
        : this.characteristicKey(row.characteristic),
    );
    return { reported, stored };
  }

  private skillKey(
    skillId: number | null,
    attributeValue: string | null,
  ): string {
    return JSON.stringify(['skill', skillId, attributeValue]);
  }

  private characteristicKey(characteristic: string): string {
    return JSON.stringify(['characteristic', characteristic]);
  }

  /** Code-unit order, independent of the runtime's locale. */
  private byText(this: void, a: string, b: string): number {
    if (a < b) {
      return -1;
    }
    return a > b ? 1 : 0;
  }
}

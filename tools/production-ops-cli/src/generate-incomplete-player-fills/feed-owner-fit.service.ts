import { Injectable } from '@nestjs/common';

import type { TpFeedHistoryReport } from '../read-tp-feed-history/tp-feed-history-index.service';
import { MAX_PAID_ADVANCEMENTS } from './advancement-fill-stage.service';
import { AdvancementPricingService } from './advancement-pricing.service';
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
 * reports, each priced in order at the cost it shows, the prices adding up
 * to his total minus his unspent SPP, and, when he has paid advancements
 * stored, the reports are exactly those advancements. No reports always
 * fit. A check that cannot be decided (SPP not stored, a skill not
 * resolved, reports not priced) gives `unknown`, so it never rules a split
 * in or out.
 *
 * Pure decision logic, with no I/O; its collaborators are pure as well.
 */
@Injectable()
export class FeedOwnerFitService {
  constructor(
    private readonly skills: FeedSkillResolverService,
    private readonly pricing: AdvancementPricingService,
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
    if (
      outcome.stepCosts.some((cost, at) => cost !== steps[at].reportedCost) ||
      outcome.total !== owner.sppTotal - owner.unspentSpp
    ) {
      return 'invalid';
    }
    return owner.paid.length === 0 || this.samePaid(steps, owner.paid)
      ? 'valid'
      : 'invalid';
  }

  /** Whether the steps are exactly the stored paid advancements, in any order. */
  private samePaid(
    steps: readonly ResolvedStep[],
    paid: readonly PaidAdvancementRow[],
  ): boolean {
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
    return (
      JSON.stringify(reported.sort(this.byText)) ===
      JSON.stringify(stored.sort(this.byText))
    );
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

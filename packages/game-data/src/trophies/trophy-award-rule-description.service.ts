import { Injectable } from '@nestjs/common';

import type {
  TrophyAwardRuleKind,
  TrophyAwardRuleMeasure,
} from '../trophy-awards/trophy-rule-types';

/**
 * One trophy's award rule, flattened to what a sentence needs. Event types
 * arrive already flattened to display strings so this service stays free of
 * any database access — its only job is wording.
 */
export interface TrophyAwardRuleDescriptionInput {
  awardRuleKind: TrophyAwardRuleKind;
  awardProcedure: string | null;
  awardRuleTieCutoff: number | null;
  awardRuleThreshold: number | null;
  awardRuleMeasure: TrophyAwardRuleMeasure | null;
  includedEventTypes: readonly string[];
  excludedEventTypes: readonly string[];
}

/**
 * How a trophy is awarded, as one sentence for the trophy deepdive header.
 *
 * A `direct_source`/`manual` trophy has a human-authored procedure, which is
 * returned verbatim — nobody can generate "a D3 roll decided it". The three
 * computed kinds have no authored procedure at all (the database forbids one),
 * so their sentence is generated from the rule itself, which keeps the
 * displayed wording and the executed rule from ever drifting apart.
 *
 * Pure and dependency-free: trophy-row in, string out, no I/O and no branching
 * on external state.
 */
@Injectable()
export class TrophyAwardRuleDescriptionService {
  describe(input: TrophyAwardRuleDescriptionInput): string {
    switch (input.awardRuleKind) {
      case 'direct_source':
      case 'manual':
        return input.awardProcedure ?? '';
      case 'max_count':
        return (
          `Awarded automatically to the player with the most ` +
          `${this.list(input.includedEventTypes, 'and')} events in the ` +
          `competition${this.tieClause(input.awardRuleTieCutoff)}.`
        );
      case 'max_spp_sum':
        return (
          'Awarded automatically to the player with the most Star Player ' +
          `Points in the competition${this.exclusionClause(
            input.excludedEventTypes,
          )}${this.tieClause(input.awardRuleTieCutoff)}.`
        );
      case 'career_threshold':
        return input.awardRuleMeasure === 'spp_sum'
          ? `Awarded automatically to every player who reaches ${String(
              input.awardRuleThreshold,
            )} Star Player Points over their career.`
          : `Awarded automatically to every player who records ${String(
              input.awardRuleThreshold,
            )} ${this.list(input.includedEventTypes, 'or')} events over ` +
              'their career.';
      default: {
        const unreachable: never = input.awardRuleKind;
        return String(unreachable);
      }
    }
  }

  /** "a", "a and b", "a, b and c" — or "qualifying" when nothing is listed. */
  private list(values: readonly string[], conjunction: string): string {
    if (values.length === 0) {
      return 'qualifying';
    }
    if (values.length === 1) {
      return values[0];
    }
    return `${values.slice(0, -1).join(', ')} ${conjunction} ${
      values[values.length - 1]
    }`;
  }

  private tieClause(tieCutoff: number | null): string {
    return tieCutoff === null
      ? ''
      : `, shared by up to ${String(tieCutoff)} tied players and not awarded ` +
          'if more tie';
  }

  private exclusionClause(excluded: readonly string[]): string {
    return excluded.length === 0
      ? ''
      : `, excluding Star Player Points from ${this.list(excluded, 'and')} events`;
  }
}

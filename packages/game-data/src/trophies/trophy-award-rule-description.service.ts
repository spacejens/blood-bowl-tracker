import { Injectable } from '@nestjs/common';

import type {
  TrophyAwardRuleKind,
  TrophyAwardRuleMeasure,
} from '../trophy-awards/trophy-rule-types';

/**
 * One trophy's award rule, flattened to what a sentence needs. Event types
 * arrive already flattened to display strings so this service stays free of
 * any database access — its only job is wording.
 *
 * Action types and consequence types are kept separate rather than merged.
 * A rule with both non-empty is a compound rule — "an action of this type
 * that ALSO caused one of these consequences" — the AND that `describe`
 * renders explicitly for `max_count`, rather than a flat OR list. A rule
 * with only one side populated (the common case, e.g. Top Scorer's
 * `touchdown` action type) reads exactly as it always has.
 *
 * Eligible positions arrive the same way, already flattened to position
 * display names. An empty list means the rule considers every player, the
 * common case; a non-empty one means only players in those positions are
 * candidates, and the sentence has to say so or it would describe a wider
 * rule than the one that actually runs.
 */
export interface TrophyAwardRuleDescriptionInput {
  awardRuleKind: TrophyAwardRuleKind;
  awardProcedure: string | null;
  awardRuleTieCutoff: number | null;
  awardRuleThreshold: number | null;
  awardRuleMeasure: TrophyAwardRuleMeasure | null;
  includedActionTypes: readonly string[];
  includedConsequenceTypes: readonly string[];
  excludedActionTypes: readonly string[];
  excludedConsequenceTypes: readonly string[];
  eligiblePositions: readonly string[];
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
          `${this.eventsPhrase(
            input.includedActionTypes,
            input.includedConsequenceTypes,
          )} in the competition${this.positionClause(
            input.eligiblePositions,
          )}${this.tieClause(input.awardRuleTieCutoff)}.`
        );
      case 'max_spp_sum':
        return (
          'Awarded automatically to the player with the most Star Player ' +
          `Points in the competition${this.positionClause(
            input.eligiblePositions,
          )}${this.exclusionClause(
            input.excludedActionTypes,
            input.excludedConsequenceTypes,
          )}${this.tieClause(input.awardRuleTieCutoff)}.`
        );
      case 'career_threshold':
        return input.awardRuleMeasure === 'spp_sum'
          ? `Awarded automatically to every player who reaches ${String(
              input.awardRuleThreshold,
            )} Star Player Points over their career${this.positionClause(
              input.eligiblePositions,
            )}.`
          : `Awarded automatically to every player who records ${String(
              input.awardRuleThreshold,
            )} ${this.list(
              [...input.includedActionTypes, ...input.includedConsequenceTypes],
              'or',
            )} events over their career${this.positionClause(
              input.eligiblePositions,
            )}.`;
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

  /**
   * The "most ... events" phrase for `max_count`. A rule with both action
   * types and consequence types curated is a compound rule — an action of
   * one of the listed types that ALSO produced one of the listed
   * consequences — so it reads as the AND it actually evaluates rather than
   * one flat list of unrelated event types. A rule with only one side
   * populated (the common case) reads exactly as it always has.
   */
  private eventsPhrase(
    actionTypes: readonly string[],
    consequenceTypes: readonly string[],
  ): string {
    if (actionTypes.length > 0 && consequenceTypes.length > 0) {
      return (
        `${this.list(actionTypes, 'and')} events that caused a ` +
        `${this.list(consequenceTypes, 'or')} consequence`
      );
    }
    return `${this.list([...actionTypes, ...consequenceTypes], 'and')} events`;
  }

  private tieClause(tieCutoff: number | null): string {
    return tieCutoff === null
      ? ''
      : `, shared by up to ${String(tieCutoff)} tied players and not awarded ` +
          'if more tie';
  }

  /**
   * The ", among players in the X and Y positions" clause a position-restricted
   * rule needs. Without it the sentence would promise the whole competition's
   * players as candidates while the executed rule only ever considers a
   * handful — exactly the drift this service exists to prevent.
   *
   * The position names are printed as curated rather than pluralised: several
   * real position names do not take a plain "s" (Lineman, Runt Punter's
   * siblings), so "players in the ... positions" carries the plural instead.
   */
  private positionClause(eligiblePositions: readonly string[]): string {
    return eligiblePositions.length === 0
      ? ''
      : `, among players in the ${this.list(eligiblePositions, 'and')} ` +
          `position${eligiblePositions.length === 1 ? '' : 's'}`;
  }

  private exclusionClause(
    excludedActionTypes: readonly string[],
    excludedConsequenceTypes: readonly string[],
  ): string {
    const excluded = [...excludedActionTypes, ...excludedConsequenceTypes];
    return excluded.length === 0
      ? ''
      : `, excluding Star Player Points from ${this.list(excluded, 'and')} events`;
  }
}

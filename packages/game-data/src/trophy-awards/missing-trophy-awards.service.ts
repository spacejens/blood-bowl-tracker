import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  competitionGroups,
  competitions,
  DB,
  eq,
  inArray,
  or,
  trophies,
  trophyAwardRuleExcludedMatchEventTypes,
  trophyAwardRuleMatchEventTypes,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import type { ActionType, ConsequenceType } from '../shared/match-event-types';
import { MaxCountTrophyRuleService } from './max-count-trophy-rule.service';
import { MaxSppSumTrophyRuleService } from './max-spp-sum-trophy-rule.service';
import { CareerThresholdTrophyRuleService } from './threshold-trophy-rule.service';
import { TrophyAwardsService } from './trophy-awards.service';
import type {
  TrophyAwardRuleKind,
  TrophyAwardRuleMeasure,
  TrophyAwardRuleRole,
  TrophyRuleEventTypes,
  TrophyRuleWinner,
} from './trophy-rule-types';

/** What one `computeMissingAwards` call did. */
export interface ComputeMissingTrophyAwardsResult {
  competitionId: number;
  /** Awards this call actually created — an already-recorded one is not counted. */
  createdAwardCount: number;
  /** Every trophy this call recorded at least one new award for. */
  awardedTrophyIds: number[];
}

/** One applicable trophy's rule, as read from `trophies`. */
interface TrophyRuleRow {
  id: number;
  awardRuleKind: TrophyAwardRuleKind;
  awardRuleRole: TrophyAwardRuleRole | null;
  awardRuleTieCutoff: number | null;
  awardRuleThreshold: number | null;
  awardRuleMeasure: TrophyAwardRuleMeasure | null;
}

const EMPTY_TYPES: TrophyRuleEventTypes = {
  actionTypes: [],
  consequenceTypes: [],
};

/**
 * The three award-rule kinds this service can compute from statistics.
 * `direct_source` comes from competition standings this feature cannot see,
 * and `manual` is by definition not derivable from statistics. Applied both
 * in the query 2 `WHERE` (so the database never returns the other two) and
 * again in application code right after (so a trophy this service should
 * never see is dropped defensively rather than reaching the exhaustive
 * `computeWinners` dispatch, which throws on an unrecognized kind).
 */
const COMPUTABLE_KINDS = [
  'max_count',
  'max_spp_sum',
  'career_threshold',
] as const satisfies readonly TrophyAwardRuleKind[];

/** The subset of `TrophyAwardRuleKind` this service actually computes. */
type ComputableTrophyAwardRuleKind = (typeof COMPUTABLE_KINDS)[number];

/** A `TrophyRuleRow` narrowed to a rule kind this service can compute. */
type ComputableTrophyRuleRow = TrophyRuleRow & {
  awardRuleKind: ComputableTrophyAwardRuleKind;
};

function isComputable(rule: TrophyRuleRow): rule is ComputableTrophyRuleRow {
  const computableKinds: readonly TrophyAwardRuleKind[] = COMPUTABLE_KINDS;
  return computableKinds.includes(rule.awardRuleKind);
}

/**
 * Fills in the trophy awards a source importer did not record, from the
 * match/player statistics already imported for a competition.
 *
 * This is the single entry point for the whole feature: every caller — the BBL
 * importer, the TP importer, and any future one — passes a competition id and
 * nothing else, so no caller holds any trophy-matching, gap-detection or rule
 * logic of its own.
 */
@Injectable()
export class MissingTrophyAwardsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly maxCount: MaxCountTrophyRuleService,
    private readonly maxSppSum: MaxSppSumTrophyRuleService,
    private readonly careerThreshold: CareerThresholdTrophyRuleService,
    private readonly trophyAwards: TrophyAwardsService,
  ) {}

  async computeMissingAwards(
    competitionId: number,
  ): Promise<ComputeMissingTrophyAwardsResult> {
    const empty: ComputeMissingTrophyAwardsResult = {
      competitionId,
      createdAwardCount: 0,
      awardedTrophyIds: [],
    };

    // 1. The competition's own scope. A trophy applies either because it is
    //    curated for this competition's group, or because it is a
    //    league-scoped lifetime trophy any competition in the league can award
    //    — the same applicability shape the direct BBL/TP award importers use.
    const [scope] = await this.db
      .select({
        competitionGroupId: competitions.competitionGroupId,
        leagueId: competitionGroups.leagueId,
      })
      .from(competitions)
      .innerJoin(
        competitionGroups,
        eq(competitionGroups.id, competitions.competitionGroupId),
      )
      .where(eq(competitions.id, competitionId));
    if (scope === undefined) {
      return empty;
    }

    // 2. Applicable trophies, restricted to the three computed kinds:
    //    `direct_source` comes from competition standings this feature cannot
    //    see, and `manual` is by definition not derivable from statistics.
    const allRules: TrophyRuleRow[] = await this.db
      .select({
        id: trophies.id,
        awardRuleKind: trophies.awardRuleKind,
        awardRuleRole: trophies.awardRuleRole,
        awardRuleTieCutoff: trophies.awardRuleTieCutoff,
        awardRuleThreshold: trophies.awardRuleThreshold,
        awardRuleMeasure: trophies.awardRuleMeasure,
      })
      .from(trophies)
      .where(
        and(
          or(
            eq(trophies.competitionGroupId, scope.competitionGroupId),
            eq(trophies.leagueId, scope.leagueId),
          ),
          inArray(trophies.awardRuleKind, COMPUTABLE_KINDS),
        ),
      );
    const rules = allRules.filter(isComputable);
    if (rules.length === 0) {
      return empty;
    }

    // 3. Gap detection: only fill in what the source importer itself did not
    //    record. `career_threshold` is deliberately exempt — a lifetime trophy
    //    can legitimately go to a second player in the same competition, so
    //    its one-award-per-player check lives per player in its rule service.
    const alreadyAwarded = await this.db
      .selectDistinct({ trophyId: trophyAwards.trophyId })
      .from(trophyAwards)
      .where(eq(trophyAwards.competitionId, competitionId));
    const awardedTrophyIds = new Set(alreadyAwarded.map((row) => row.trophyId));
    const pending = rules.filter(
      (rule) =>
        rule.awardRuleKind === 'career_threshold' ||
        !awardedTrophyIds.has(rule.id),
    );
    if (pending.length === 0) {
      return empty;
    }

    // 4./5. Curated event types for every remaining trophy, in two queries
    //       rather than two per trophy.
    const pendingIds = pending.map((rule) => rule.id);
    const included = await this.db
      .select({
        trophyId: trophyAwardRuleMatchEventTypes.trophyId,
        actionType: trophyAwardRuleMatchEventTypes.actionType,
        consequenceType: trophyAwardRuleMatchEventTypes.consequenceType,
      })
      .from(trophyAwardRuleMatchEventTypes)
      .where(inArray(trophyAwardRuleMatchEventTypes.trophyId, pendingIds));
    const excluded = await this.db
      .select({
        trophyId: trophyAwardRuleExcludedMatchEventTypes.trophyId,
        actionType: trophyAwardRuleExcludedMatchEventTypes.actionType,
        consequenceType: trophyAwardRuleExcludedMatchEventTypes.consequenceType,
      })
      .from(trophyAwardRuleExcludedMatchEventTypes)
      .where(
        inArray(trophyAwardRuleExcludedMatchEventTypes.trophyId, pendingIds),
      );
    const includedByTrophy = groupEventTypes(included);
    const excludedByTrophy = groupEventTypes(excluded);

    let createdAwardCount = 0;
    const awardedTrophies: number[] = [];
    for (const rule of pending) {
      const winners = await this.computeWinners({
        rule,
        competitionId,
        leagueId: scope.leagueId,
        types: includedByTrophy.get(rule.id) ?? EMPTY_TYPES,
        excludedTypes: excludedByTrophy.get(rule.id) ?? EMPTY_TYPES,
      });
      let createdForTrophy = 0;
      for (const winner of winners) {
        const { created } = await this.trophyAwards.upsert({
          trophyId: rule.id,
          competitionId,
          teamEraId: winner.teamEraId,
          playerId: winner.playerId,
        });
        if (created) {
          createdForTrophy += 1;
        }
      }
      if (createdForTrophy > 0) {
        createdAwardCount += createdForTrophy;
        awardedTrophies.push(rule.id);
      }
    }

    return {
      competitionId,
      createdAwardCount,
      awardedTrophyIds: awardedTrophies,
    };
  }

  /**
   * Dispatch by rule kind. The `never` fallthrough is what makes adding a
   * fourth computed kind a compile error here rather than a silent no-op.
   * A computed trophy with a null role, cutoff, measure or threshold cannot
   * exist — the database's `trophies_award_rule` check forbids it — so the
   * nullish fallbacks below are only present to satisfy the type system.
   */
  private computeWinners(options: {
    rule: ComputableTrophyRuleRow;
    competitionId: number;
    leagueId: number;
    types: TrophyRuleEventTypes;
    excludedTypes: TrophyRuleEventTypes;
  }): Promise<TrophyRuleWinner[]> {
    const { rule, competitionId, leagueId, types, excludedTypes } = options;
    const role = rule.awardRuleRole ?? 'acting';
    switch (rule.awardRuleKind) {
      case 'max_count':
        return this.maxCount.compute({
          competitionId,
          role,
          types,
          tieCutoff: rule.awardRuleTieCutoff ?? 1,
        });
      case 'max_spp_sum':
        return this.maxSppSum.compute({
          competitionId,
          role,
          types,
          excludedTypes,
          tieCutoff: rule.awardRuleTieCutoff ?? 1,
        });
      case 'career_threshold':
        return this.careerThreshold.compute({
          trophyId: rule.id,
          // Both scopes: the figure accumulates across the league, but the
          // award only lands here if this is the competition the player
          // actually crossed the threshold in.
          competitionId,
          leagueId,
          role,
          types,
          threshold: rule.awardRuleThreshold ?? 0,
          measure: rule.awardRuleMeasure ?? 'event_count',
        });
      default: {
        const unreachable: never = rule.awardRuleKind;
        throw new Error(
          `Trophy ${rule.id} has award rule kind ${String(unreachable)}, ` +
            'which is not computable.',
        );
      }
    }
  }
}

/**
 * Fold junction rows into one `TrophyRuleEventTypes` per trophy. Each row sets
 * exactly one of the two columns — the table's own check guarantees it — so
 * the fold needs no tie-breaking.
 */
function groupEventTypes(
  rows: readonly {
    trophyId: number;
    actionType: ActionType | null;
    consequenceType: ConsequenceType | null;
  }[],
): Map<number, TrophyRuleEventTypes> {
  const byTrophy = new Map<
    number,
    { actionTypes: ActionType[]; consequenceTypes: ConsequenceType[] }
  >();
  for (const row of rows) {
    const entry = byTrophy.get(row.trophyId) ?? {
      actionTypes: [],
      consequenceTypes: [],
    };
    if (row.actionType !== null) {
      entry.actionTypes.push(row.actionType);
    }
    if (row.consequenceType !== null) {
      entry.consequenceTypes.push(row.consequenceType);
    }
    byTrophy.set(row.trophyId, entry);
  }
  return byTrophy;
}

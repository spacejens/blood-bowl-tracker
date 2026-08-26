import type {
  ActionType,
  ConsequenceAvoidedBy,
  ConsequenceType,
  UnidentifiedParticipantKind,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type {
  BblEventSide,
  BblMatchEvents,
} from '../matches/match-events-page-parser';

/** The category slug used in an event's synthesized external id, per action. */
export const ACTION_CATEGORY: Record<ActionType, string> = {
  touchdown: 'td',
  completion: 'completion',
  interception: 'interception',
  deflection: 'deflection',
  foul: 'foul',
  mvp_award: 'mvp',
  casualty: 'cas',
  badly_hurt: 'badly-hurt',
  serious_injury: 'serious',
  death: 'death',
  inducements: 'inducements',
  winnings: 'winnings',
  fan_factor: 'fan-factor',
  journeymen_signings: 'journeyman',
  prayers_to_nuffle: 'prayers',
  secret_objective: 'secret-objective',
  // TP-only (code 46, "successful landing") — BBL has no equivalent event to
  // scrape, so this category slug is never actually used by import-bbl, but
  // ACTION_CATEGORY must stay exhaustive over the shared ActionType enum.
  successful_landing: 'landing',
  // TP-only (code 45, "throw team-mate") — same rationale as successful_landing.
  throw_team_mate: 'throw-team-mate',
  // TP-only (code 47, "catch") — same rationale as successful_landing.
  catch: 'catch',
};

/** The category slug used in an event's synthesized external id, per consequence. */
export const CONSEQUENCE_CATEGORY: Record<ConsequenceType, string> = {
  casualty: 'cas',
  badly_hurt: 'badly-hurt',
  serious_injury: 'serious',
  miss_next_game: 'miss-next-game',
  niggling_injury: 'niggling',
  stat_reduction_ma: 'stat-ma',
  stat_reduction_st: 'stat-st',
  stat_reduction_ag: 'stat-ag',
  stat_reduction_av: 'stat-av',
  stat_reduction_pa: 'stat-pa',
  death: 'death',
  sent_off: 'sent-off',
  expensive_mistake: 'expensive-mistake',
  concession: 'concession',
  dedicated_fans: 'dedicated-fans',
  casualty_avoided: 'cas-avoided',
};

/**
 * A casualty-action severity and the Sustained-Injury consequences it may be
 * correlated with. A `badly_hurt` action only ever pairs with a `badly_hurt`
 * consequence; a `serious_injury` action pairs with any lasting-injury row; a
 * `death` action only pairs with a `death` consequence.
 */
const SEVERITY_GROUPS: {
  action: ActionType;
  consequences: ReadonlySet<ConsequenceType>;
}[] = [
  {
    action: 'badly_hurt',
    consequences: new Set<ConsequenceType>(['badly_hurt']),
  },
  {
    action: 'serious_injury',
    consequences: new Set<ConsequenceType>([
      'serious_injury',
      'miss_next_game',
      'niggling_injury',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
    ]),
  },
  { action: 'death', consequences: new Set<ConsequenceType>(['death']) },
];

/** One casualty/achievement occurrence tagged with its team code and source match. */
interface TeamCodedAction {
  actionType: ActionType;
  teamCode: string;
  pid: string | null;
  sourceBblId: string;
  /**
   * Carried verbatim from the parsed occurrence: this casualty was caused by
   * a foul. `actionType` still holds the severity tier so `SEVERITY_GROUPS`
   * matching is unaffected; the flag is consulted only when an `EmittedEvent`
   * is constructed, where it replaces the emitted action type with `'foul'`.
   */
  viaFoul?: boolean;
  /** Carried verbatim from the parsed occurrence; never affects matching. */
  unidentifiedKind?: UnidentifiedParticipantKind;
}
interface TeamCodedConsequence {
  consequenceType: ConsequenceType;
  teamCode: string;
  pid: string | null;
  sourceBblId: string;
  unidentifiedKind?: UnidentifiedParticipantKind;
  /**
   * Set when the source said the casualty was prevented. Such a consequence is
   * an ordinary member of its severity group's merge-candidate pool, treated
   * no differently from a real one when the group's candidates are paired off
   * (or left unpaired) — see `correlateEvents`. Either way the emitted event
   * describes it as `casualty_avoided` carrying the prevented severity, never
   * as the raw severity.
   */
  avoidedBy?: ConsequenceAvoidedBy;
}
/**
 * The combined occurrences of one match (2 team codes) or a merged pair
 * (4 team codes), each occurrence tagged with the code of the team it belongs
 * to and the source match it came from.
 */
export interface CombinedOccurrences {
  /** Distinct team codes present, in a stable order (home, away, [partner home, partner away]). */
  teamCodes: string[];
  actions: TeamCodedAction[];
  consequences: TeamCodedConsequence[];
  journeymenSignings: {
    teamCode: string;
    count: number;
    sourceBblId: string;
  }[];
}

/**
 * One match event to emit, agnostic of DB ids. A merged casualty event carries
 * both an action (on actingTeamCode, from actingSourceBblId) and a consequence
 * (on consequenceTeamCode, from consequenceSourceBblId); an action-only event
 * carries just the action side; a consequence-only event just the consequence.
 */
export interface EmittedEvent {
  actionType?: ActionType;
  consequenceType?: ConsequenceType;
  actingTeamCode?: string;
  consequenceTeamCode?: string;
  actingSourceBblId?: string;
  consequenceSourceBblId?: string;
  actingPid?: string | null;
  consequencePid?: string | null;
  journeymenCount?: number;
  actingUnidentifiedKind?: UnidentifiedParticipantKind;
  consequenceUnidentifiedKind?: UnidentifiedParticipantKind;
  consequenceAvoidedBy?: ConsequenceAvoidedBy;
  /** The severity that was prevented; only set with `casualty_avoided`. */
  consequenceAvoidedSeverity?: ConsequenceType;
}

/**
 * One acting team's candidate action/consequence pairing within one severity
 * group, computed without consuming anything so that every acting team's
 * claim on a consequence can be compared against every other's before any
 * merge is committed. `actionIndices` and `consequenceIndices` are indices
 * into `CombinedOccurrences.actions` / `.consequences`, equal in length, and
 * paired by position.
 */
interface TentativePairing {
  actingTeamCode: string;
  actionIndices: number[];
  consequenceIndices: number[];
}

/**
 * Combines raw per-match occurrences into a team-coded shape and correlates
 * casualty actions with their Sustained-Injury consequences.
 */
@Injectable()
export class MatchEventCorrelationService {
  /**
   * Build the combined, team-coded occurrences of one match (or a merged pair,
   * when a partner's events are supplied). Each side occurrence is tagged with
   * the concrete team code it belongs to (homeTeamId/awayTeamId of its own source
   * match) and the source match's bblId, so a merged four-team match's occurrences
   * from both source pages coexist without a home/away collision.
   */
  combineOccurrences(...sources: BblMatchEvents[]): CombinedOccurrences {
    const teamCodes: string[] = [];
    const actions: TeamCodedAction[] = [];
    const consequences: TeamCodedConsequence[] = [];
    const journeymenSignings: CombinedOccurrences['journeymenSignings'] = [];

    for (const source of sources) {
      const codeBySide: Record<BblEventSide, string> = {
        home: source.homeTeamId,
        away: source.awayTeamId,
      };
      for (const code of [source.homeTeamId, source.awayTeamId]) {
        if (!teamCodes.includes(code)) {
          teamCodes.push(code);
        }
      }
      for (const a of source.actions) {
        actions.push({
          actionType: a.actionType,
          teamCode: codeBySide[a.side],
          pid: a.pid,
          sourceBblId: source.bblId,
          ...(a.viaFoul ? { viaFoul: true } : {}),
          ...(a.unidentifiedKind
            ? { unidentifiedKind: a.unidentifiedKind }
            : {}),
        });
      }
      for (const c of source.consequences) {
        consequences.push({
          consequenceType: c.consequenceType,
          teamCode: codeBySide[c.side],
          pid: c.pid,
          sourceBblId: source.bblId,
          ...(c.unidentifiedKind
            ? { unidentifiedKind: c.unidentifiedKind }
            : {}),
          ...(c.avoidedBy ? { avoidedBy: c.avoidedBy } : {}),
        });
      }

      const journeymen = source.journeymenCount ?? { home: 0, away: 0 };
      for (const side of ['home', 'away'] as const) {
        if (journeymen[side] > 0) {
          journeymenSignings.push({
            teamCode: codeBySide[side],
            count: journeymen[side],
            sourceBblId: source.bblId,
          });
        }
      }
    }

    return { teamCodes, actions, consequences, journeymenSignings };
  }

  /**
   * Action and consequence candidates merge only when their counts are equal
   * AND one side's candidates are pairwise identical (see `actionKey` /
   * `consequenceKey`): identical candidates make the pairing irrelevant, since
   * any permutation yields the same events and no attribution can be wrong.
   * A single candidate satisfies this vacuously.
   *
   * Everything else falls through to independent action-only and
   * consequence-only events rather than guessing a pairing, so no occurrence
   * is ever dropped. Emission order — merged, then leftover actions, then
   * leftover consequences, each in occurrence order — is what fixes the
   * external-id occurrence indices deterministically.
   *
   * A `viaFoul` casualty matches by severity tier like any other but emits
   * `actionType: 'foul'`: Blood Bowl awards no casualty credit for a foul.
   */
  correlateEvents(combined: CombinedOccurrences): EmittedEvent[] {
    const actionConsumed = combined.actions.map(() => false);
    const consequenceConsumed = combined.consequences.map(() => false);
    const merged: EmittedEvent[] = [];

    // Phase 1 + 2, per severity group: collect every acting team's
    // tentatively-unambiguous pairing, then drop the ones that contend with
    // another acting team's over the same consequence. Groups are handled
    // independently because SEVERITY_GROUPS partitions both the action types
    // and the consequence types disjointly, so no group's outcome can affect
    // another's candidate pool.
    const survivingPairings = SEVERITY_GROUPS.map((group) =>
      this.withoutConflicts(this.tentativePairings(combined, group)),
    );

    // Phase 3: commit. Walked acting-team-outer / group-inner, exactly as
    // before the two-phase split, so merged-event order — and therefore the
    // external-id occurrence indices derived from it — is unchanged.
    for (const actingTeamCode of combined.teamCodes) {
      for (const pairings of survivingPairings) {
        const pairing = pairings.find(
          (candidate) => candidate.actingTeamCode === actingTeamCode,
        );
        if (pairing === undefined) {
          continue;
        }
        for (let pair = 0; pair < pairing.actionIndices.length; pair++) {
          const action = combined.actions[pairing.actionIndices[pair]];
          const consequence =
            combined.consequences[pairing.consequenceIndices[pair]];
          actionConsumed[pairing.actionIndices[pair]] = true;
          consequenceConsumed[pairing.consequenceIndices[pair]] = true;
          merged.push({
            actionType: action.viaFoul ? 'foul' : action.actionType,
            actingTeamCode,
            actingSourceBblId: action.sourceBblId,
            actingPid: action.pid,
            ...(action.unidentifiedKind
              ? { actingUnidentifiedKind: action.unidentifiedKind }
              : {}),
            ...this.consequenceSide(consequence),
          });
        }
      }
    }

    const actionOnly: EmittedEvent[] = combined.actions
      .filter((_, i) => !actionConsumed[i])
      .map((a) => ({
        actionType: a.viaFoul ? 'foul' : a.actionType,
        actingTeamCode: a.teamCode,
        actingSourceBblId: a.sourceBblId,
        actingPid: a.pid,
        ...(a.unidentifiedKind
          ? { actingUnidentifiedKind: a.unidentifiedKind }
          : {}),
      }));
    const consequenceOnly: EmittedEvent[] = combined.consequences
      .filter((_, i) => !consequenceConsumed[i])
      .map((c) => this.consequenceSide(c));

    const journeymanEvents: EmittedEvent[] = combined.journeymenSignings.map(
      (j) => ({
        actionType: 'journeymen_signings',
        actingTeamCode: j.teamCode,
        actingSourceBblId: j.sourceBblId,
        actingPid: null,
        journeymenCount: j.count,
      }),
    );

    return [...merged, ...actionOnly, ...consequenceOnly, ...journeymanEvents];
  }

  /**
   * Phase 1 of correlation: every acting team's candidate pairing for one
   * severity group, filtered to those that are unambiguous *in isolation* —
   * equal candidate counts on both sides, and at least one side's candidates
   * pairwise identical (see {@link actionKey} / {@link consequenceKey}).
   * Nothing is consumed here: a consequence can legitimately appear in two
   * different acting teams' pairings at this stage, which is exactly the
   * cross-team contention {@link withoutConflicts} then resolves.
   *
   * The consumed flags are deliberately not consulted. Within a group nothing
   * is consumed until the commit phase, and across groups SEVERITY_GROUPS
   * partitions action and consequence types disjointly, so no candidate
   * reaching here can already have been consumed.
   */
  private tentativePairings(
    combined: CombinedOccurrences,
    group: (typeof SEVERITY_GROUPS)[number],
  ): TentativePairing[] {
    const tentative: TentativePairing[] = [];
    for (const actingTeamCode of combined.teamCodes) {
      const actionIndices = combined.actions.flatMap((a, i) =>
        a.teamCode === actingTeamCode && a.actionType === group.action
          ? [i]
          : [],
      );
      const consequenceIndices = combined.consequences.flatMap((c, i) =>
        c.teamCode !== actingTeamCode &&
        group.consequences.has(c.consequenceType)
          ? [i]
          : [],
      );
      const pairCount = actionIndices.length;
      const pairingIsUnambiguous =
        pairCount > 0 &&
        consequenceIndices.length === pairCount &&
        (this.allIdentical(
          actionIndices.map((i) => this.actionKey(combined.actions[i])),
        ) ||
          this.allIdentical(
            consequenceIndices.map((i) =>
              this.consequenceKey(combined.consequences[i]),
            ),
          ));
      if (pairingIsUnambiguous) {
        tentative.push({ actingTeamCode, actionIndices, consequenceIndices });
      }
    }
    return tentative;
  }

  /**
   * Phase 2 of correlation: the tentative pairings of one severity group that
   * no *other* acting team also lays claim to. A consequence claimed by two
   * acting teams is a genuine cross-team ambiguity — in a merged four-team
   * match the consequence-candidate filter (`c.teamCode !== actingTeamCode`)
   * spans up to three other teams, so two teams' actions can each be the sole
   * plausible cause of the same consequence — and it invalidates *every*
   * pairing referencing it, not just the later one, matching this file's
   * all-or-nothing treatment of ambiguity: nothing merges, and the actions
   * and consequence fall through to unpaired events.
   *
   * Only the consequence side can contend. An action's `teamCode` is fixed,
   * so it is only ever a candidate for its own team's pairing. Indices within
   * a single pairing are distinct, so a pairing can never contend with itself.
   */
  private withoutConflicts(pairings: TentativePairing[]): TentativePairing[] {
    const claims = new Map<number, number>();
    for (const pairing of pairings) {
      for (const index of pairing.consequenceIndices) {
        claims.set(index, (claims.get(index) ?? 0) + 1);
      }
    }
    return pairings.filter((pairing) =>
      pairing.consequenceIndices.every((index) => claims.get(index) === 1),
    );
  }

  /**
   * A canonical string identifying everything about an action that reaches the
   * emitted event. Two actions with equal keys are interchangeable: swapping
   * which of them merges with which consequence cannot change the resulting
   * set of events. `teamCode` is excluded on purpose — the action-candidate
   * filter (`a.teamCode === actingTeamCode`) already guarantees it is equal
   * across every candidate considered. This guarantee is specific to actions:
   * see {@link consequenceKey} for why the consequence side cannot make the
   * same exclusion.
   */
  private actionKey(action: TeamCodedAction): string {
    return JSON.stringify({
      actionType: action.actionType,
      pid: action.pid,
      viaFoul: action.viaFoul,
      unidentifiedKind: action.unidentifiedKind,
      sourceBblId: action.sourceBblId,
    });
  }

  /**
   * The consequence-side counterpart of {@link actionKey}. Unlike the action
   * side, `teamCode` IS included here: the consequence-candidate filter
   * (`c.teamCode !== actingTeamCode`) only excludes the acting team, so in a
   * merged four-team match it can admit candidates from up to three distinct
   * teams. Without `teamCode` in this key, two consequences on different
   * teams that otherwise match could be judged "identical" and trigger a
   * merge whose specific action-to-consequence pairing is not actually
   * provably irrelevant.
   */
  private consequenceKey(consequence: TeamCodedConsequence): string {
    return JSON.stringify({
      consequenceType: consequence.consequenceType,
      teamCode: consequence.teamCode,
      pid: consequence.pid,
      avoidedBy: consequence.avoidedBy,
      unidentifiedKind: consequence.unidentifiedKind,
      sourceBblId: consequence.sourceBblId,
    });
  }

  /**
   * Whether every candidate on a side is identical to the others. Comparing
   * each key against the first is sufficient because key equality is plain
   * string equality, and therefore transitive. An empty or single-element list
   * is vacuously identical, which is what makes the existing one-action /
   * one-consequence merge a trivial instance of the general rule.
   */
  private allIdentical(keys: string[]): boolean {
    return keys.every((key) => key === keys[0]);
  }

  /**
   * The consequence-side fields of an emitted event, used identically by the
   * merged and consequence-only paths so a prevented casualty is described the
   * same way whether or not it merged with a causer action. An avoided
   * casualty becomes `casualty_avoided` carrying the prevented severity, so no
   * casualty-suffered statistic counts it while "deaths prevented" stays
   * queryable.
   */
  private consequenceSide(consequence: TeamCodedConsequence): EmittedEvent {
    return {
      consequenceType:
        consequence.avoidedBy === undefined
          ? consequence.consequenceType
          : 'casualty_avoided',
      ...(consequence.avoidedBy
        ? {
            consequenceAvoidedBy: consequence.avoidedBy,
            consequenceAvoidedSeverity: consequence.consequenceType,
          }
        : {}),
      consequenceTeamCode: consequence.teamCode,
      consequenceSourceBblId: consequence.sourceBblId,
      consequencePid: consequence.pid,
      ...(consequence.unidentifiedKind
        ? { consequenceUnidentifiedKind: consequence.unidentifiedKind }
        : {}),
    };
  }
}

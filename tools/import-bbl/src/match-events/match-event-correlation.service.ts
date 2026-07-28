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
   * Correlate raw occurrences into events. For a given acting team code and
   * severity group, the N action candidates on that team and the N matching
   * consequence candidates on ANY other team (one other team for a normal
   * 2-team match, three for a merged 4-team match) merge into N events, paired
   * by index, when the counts are equal AND at least one of the two sides'
   * candidates are pairwise identical to each other (see `actionKey` /
   * `consequenceKey`). Identical candidates on one side make the pairing
   * irrelevant: any permutation yields the same set of events, so no
   * attribution can be wrong. N = 1 is the common instance of this rule, since
   * a single candidate is vacuously identical to itself.
   *
   * Everything else — unequal counts, or equal counts where both sides'
   * candidates differ internally so the pairing would be a guess — falls
   * through to independent action-only and consequence-only events, so no
   * occurrence is ever dropped. Emission order is merged events first, then
   * leftover actions in occurrence order, then leftover consequences in
   * occurrence order; that order fixes the external-id occurrence indices
   * deterministically.
   *
   * A prevented casualty (`avoidedBy` set) is an ordinary candidate in that
   * pool alongside real consequences, merging or not by exactly the rule
   * above; `avoidedBy` is one of the fields compared when deciding whether the
   * consequence side is pairwise identical. A merged prevented casualty still
   * carries `consequenceType: 'casualty_avoided'` with the prevented severity
   * in `consequenceAvoidedSeverity`.
   *
   * A casualty occurrence marked `viaFoul` keeps matching by its severity tier
   * like any other, but the event finally emitted for it carries
   * `actionType: 'foul'` — so a foul that caused a casualty becomes one
   * `'foul'` action + `<severity>` consequence row, counting as a foul and
   * (correctly, per Blood Bowl's rules) not as a casualty caused. Under
   * ambiguity (2+ same-severity actions on one side) that single merged row
   * degrades to the usual action-only/consequence-only fallback — a `viaFoul`
   * action still emits as `actionType: 'foul'`, just without a linked
   * consequence, unlike TP where an unpaired foul stays entirely separate
   * from its casualty rather than half-merging.
   */
  correlateEvents(combined: CombinedOccurrences): EmittedEvent[] {
    const actionConsumed = combined.actions.map(() => false);
    const consequenceConsumed = combined.consequences.map(() => false);
    const merged: EmittedEvent[] = [];

    for (const actingTeamCode of combined.teamCodes) {
      for (const group of SEVERITY_GROUPS) {
        const actionIndices = combined.actions.flatMap((a, i) =>
          !actionConsumed[i] &&
          a.teamCode === actingTeamCode &&
          a.actionType === group.action
            ? [i]
            : [],
        );
        const consequenceIndices = combined.consequences.flatMap((c, i) =>
          !consequenceConsumed[i] &&
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
          for (let pair = 0; pair < pairCount; pair++) {
            const action = combined.actions[actionIndices[pair]];
            const consequence = combined.consequences[consequenceIndices[pair]];
            actionConsumed[actionIndices[pair]] = true;
            consequenceConsumed[consequenceIndices[pair]] = true;
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
   * A canonical string identifying everything about an action that reaches the
   * emitted event. Two actions with equal keys are interchangeable: swapping
   * which of them merges with which consequence cannot change the resulting
   * set of events. `teamCode` is excluded on purpose — the merge-candidate
   * filter already guarantees it is equal across every candidate considered.
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

  /** The consequence-side counterpart of {@link actionKey}. */
  private consequenceKey(consequence: TeamCodedConsequence): string {
    return JSON.stringify({
      consequenceType: consequence.consequenceType,
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

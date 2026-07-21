import type {
  ActionType,
  ConsequenceType,
} from '@blood-bowl-tracker/api-contract';

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
}
interface TeamCodedConsequence {
  consequenceType: ConsequenceType;
  teamCode: string;
  pid: string | null;
  sourceBblId: string;
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
}

/**
 * Build the combined, team-coded occurrences of one match (or a merged pair,
 * when a partner's events are supplied). Each side occurrence is tagged with
 * the concrete team code it belongs to (homeTeamId/awayTeamId of its own source
 * match) and the source match's bblId, so a merged four-team match's occurrences
 * from both source pages coexist without a home/away collision.
 */
export function combineOccurrences(
  ...sources: BblMatchEvents[]
): CombinedOccurrences {
  const teamCodes: string[] = [];
  const actions: TeamCodedAction[] = [];
  const consequences: TeamCodedConsequence[] = [];

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
      });
    }
    for (const c of source.consequences) {
      consequences.push({
        consequenceType: c.consequenceType,
        teamCode: codeBySide[c.side],
        pid: c.pid,
        sourceBblId: source.bblId,
      });
    }
  }

  return { teamCodes, actions, consequences };
}

/**
 * Correlate raw occurrences into events. A casualty action and a
 * Sustained-Injury consequence merge into a single event only when, for a given
 * acting team code and severity group, there is exactly one action candidate on
 * that team and exactly one matching consequence candidate on ANY other team
 * (one other team for a normal 2-team match, three for a merged 4-team match).
 * Everything else — including every ambiguous casualty where 2+ candidates
 * exist — falls through to independent action-only and consequence-only events,
 * so no occurrence is ever dropped. Emission order is merged events first, then
 * leftover actions in occurrence order, then leftover consequences in occurrence
 * order; that order fixes the external-id occurrence indices deterministically.
 */
export function correlateEvents(combined: CombinedOccurrences): EmittedEvent[] {
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
      if (actionIndices.length === 1 && consequenceIndices.length === 1) {
        const action = combined.actions[actionIndices[0]];
        const consequence = combined.consequences[consequenceIndices[0]];
        actionConsumed[actionIndices[0]] = true;
        consequenceConsumed[consequenceIndices[0]] = true;
        merged.push({
          actionType: action.actionType,
          consequenceType: consequence.consequenceType,
          actingTeamCode,
          actingSourceBblId: action.sourceBblId,
          actingPid: action.pid,
          consequenceTeamCode: consequence.teamCode,
          consequenceSourceBblId: consequence.sourceBblId,
          consequencePid: consequence.pid,
        });
      }
    }
  }

  const actionOnly: EmittedEvent[] = combined.actions
    .filter((_, i) => !actionConsumed[i])
    .map((a) => ({
      actionType: a.actionType,
      actingTeamCode: a.teamCode,
      actingSourceBblId: a.sourceBblId,
      actingPid: a.pid,
    }));
  const consequenceOnly: EmittedEvent[] = combined.consequences
    .filter((_, i) => !consequenceConsumed[i])
    .map((c) => ({
      consequenceType: c.consequenceType,
      consequenceTeamCode: c.teamCode,
      consequenceSourceBblId: c.sourceBblId,
      consequencePid: c.pid,
    }));

  return [...merged, ...actionOnly, ...consequenceOnly];
}

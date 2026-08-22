import type { SppCareerCounts } from '@blood-bowl-tracker/api-contract';
import type {
  actionTypeEnum,
  consequenceTypeEnum,
} from '@blood-bowl-tracker/db';

/** A value of the `action_type` DB enum. */
export type ActionType = (typeof actionTypeEnum.enumValues)[number];

/** A value of the `consequence_type` DB enum. */
export type ConsequenceType = (typeof consequenceTypeEnum.enumValues)[number];

// --- Acting-role type sets (filtered on matchEvents.actionType) ---

export const MVP_AWARD_TYPES: readonly ActionType[] = ['mvp_award'];
export const TOUCHDOWN_TYPES: readonly ActionType[] = ['touchdown'];
export const COMPLETION_TYPES: readonly ActionType[] = ['completion'];
export const INTERCEPTION_TYPES: readonly ActionType[] = ['interception'];
export const DEFLECTION_TYPES: readonly ActionType[] = ['deflection'];
/**
 * A Big Guy's Throw Team-Mate action, counted on the throwing player. The
 * thrown player's own side of the play is {@link CATCH_TYPES}, a separate
 * event on a separate player.
 */
export const THROW_TEAM_MATE_TYPES: readonly ActionType[] = ['throw_team_mate'];
/**
 * The thrown player's catch. Deliberately absent from
 * {@link SPP_EARNING_ACTION_TYPES} and {@link SPP_CAREER_COUNT_GROUPS}: no
 * source's roster export carries a career total for it, so there is nothing
 * for the ongoing-competition estimate to price. A TP-sourced event still
 * carries its own reported `spp_value`.
 */
export const CATCH_TYPES: readonly ActionType[] = ['catch'];
/**
 * Fouls, counted on the acting side. A foul that CAUSED a casualty is imported
 * (from both BBL and TP) as a single row carrying `actionType: 'foul'` plus the
 * victim's `consequenceType`. Because acting-role counts filter on
 * `actionType` alone, such a row counts here as a foul — and, `'foul'` being
 * absent from {@link CASUALTY_CAUSED_TYPES}, deliberately does NOT count as a
 * casualty caused: Blood Bowl awards no casualty credit for a foul. The
 * victim's side of the same row still counts under
 * {@link CASUALTY_SUFFERED_TYPES}.
 */
export const FOUL_TYPES: readonly ActionType[] = ['foul'];

/**
 * Every action type that inflicts a casualty of any severity. A death is a
 * casualty; a serious injury is a casualty. `'foul'` is intentionally excluded
 * — see {@link FOUL_TYPES}.
 */
export const CASUALTY_CAUSED_TYPES: readonly ActionType[] = [
  'casualty',
  'badly_hurt',
  'serious_injury',
  'death',
];
export const SERIOUS_INJURY_CAUSED_TYPES: readonly ActionType[] = [
  'serious_injury',
];
export const DEATH_CAUSED_TYPES: readonly ActionType[] = ['death'];

/**
 * Every action type that earns Star Player Points under the standardised
 * award table, and therefore the only ones `spp_award_values` holds rows for
 * and the only ones a BBL-computed `match_events.spp_value` is ever non-null
 * on. NOT the only action types `spp_value` can be non-null on overall: a
 * TP-sourced event carries TP's own reported figure verbatim regardless of
 * action type, so a type absent from this list (e.g. a successful landing)
 * can still have one from TP. Built from {@link CASUALTY_CAUSED_TYPES} so the
 * casualty severities cannot drift apart between the two lists. `'foul'` is
 * excluded for the same reason it is excluded there: Blood Bowl awards no
 * credit for a foul under the standardised table (TP may still report a
 * figure for one, which is imported as-is).
 */
export const SPP_EARNING_ACTION_TYPES: readonly ActionType[] = [
  'touchdown',
  'completion',
  'interception',
  'deflection',
  'mvp_award',
  ...CASUALTY_CAUSED_TYPES,
];

/**
 * One career-count group key. `Extract` against {@link ActionType} is what
 * guarantees each key of the wire-side `SppCareerCounts` really is an
 * `action_type` value — the group's award value is looked up by that very key,
 * so a key that is not an action type would be a silent runtime miss.
 */
export type SppCareerCountGroup = Extract<ActionType, keyof SppCareerCounts>;

/**
 * Which imported action types roll up into each career-count group. The key IS
 * the representative action type whose `spp_award_values` row prices the whole
 * group. Interceptions and deflections share one group, and every casualty
 * severity shares one, because the {@link SppCareerCounts} wire contract has
 * one combined counter for each — the imported side must be grouped
 * identically to that contract or the comparison is meaningless, regardless of
 * which source (TP today, potentially others later) populates the counts.
 * Typed over `keyof SppCareerCounts` so adding a group to the contract without
 * adding it here is a compile error.
 */
export const SPP_CAREER_COUNT_GROUPS: Readonly<
  Record<keyof SppCareerCounts, readonly ActionType[]>
> = {
  touchdown: TOUCHDOWN_TYPES,
  completion: COMPLETION_TYPES,
  interception: [...INTERCEPTION_TYPES, ...DEFLECTION_TYPES],
  mvp_award: MVP_AWARD_TYPES,
  casualty: CASUALTY_CAUSED_TYPES,
};

// --- Consequence-role type sets (filtered on matchEvents.consequenceType) ---

export const EXPENSIVE_MISTAKE_TYPES: readonly ConsequenceType[] = [
  'expensive_mistake',
];

export const SENT_OFF_TYPES: readonly ConsequenceType[] = ['sent_off'];

/** Every consequence that records a casualty of any severity or after-effect. */
export const CASUALTY_SUFFERED_TYPES: readonly ConsequenceType[] = [
  'casualty',
  'badly_hurt',
  'death',
  'serious_injury',
  'niggling_injury',
  'miss_next_game',
  'stat_reduction_ma',
  'stat_reduction_st',
  'stat_reduction_ag',
  'stat_reduction_av',
  'stat_reduction_pa',
];

/** Casualties whose effect outlasts the match itself. */
export const SERIOUS_INJURY_SUFFERED_TYPES: readonly ConsequenceType[] = [
  'serious_injury',
  'niggling_injury',
  'miss_next_game',
  'stat_reduction_ma',
  'stat_reduction_st',
  'stat_reduction_ag',
  'stat_reduction_av',
  'stat_reduction_pa',
];

/** Casualties that permanently diminish the player. */
export const LASTING_INJURY_SUFFERED_TYPES: readonly ConsequenceType[] = [
  'niggling_injury',
  'stat_reduction_ma',
  'stat_reduction_st',
  'stat_reduction_ag',
  'stat_reduction_av',
  'stat_reduction_pa',
];

export const DEATH_SUFFERED_TYPES: readonly ConsequenceType[] = ['death'];

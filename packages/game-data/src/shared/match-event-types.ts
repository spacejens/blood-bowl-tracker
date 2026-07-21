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
export const FOUL_TYPES: readonly ActionType[] = ['foul'];

/**
 * Every action type that inflicts a casualty of any severity. A death is a
 * casualty; a serious injury is a casualty.
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

// --- Consequence-role type sets (filtered on matchEvents.consequenceType) ---

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

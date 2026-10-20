/**
 * The kinds of Discord interaction the bot records usage for. Autocomplete is
 * deliberately absent: it fires per keystroke and would swamp the data.
 */
export const INTERACTION_KINDS = ['command', 'button', 'select_menu'] as const;

export type InteractionKind = (typeof INTERACTION_KINDS)[number];

/**
 * Whether the bot's handler produced its intended reply or threw. A failure
 * row also carries the thrown error's message.
 */
export const INTERACTION_OUTCOMES = ['success', 'failure'] as const;

export type InteractionOutcome = (typeof INTERACTION_OUTCOMES)[number];

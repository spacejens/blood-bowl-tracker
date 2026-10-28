/**
 * What an advancement's SPP cost buys.
 *
 * - `table_roll` — a roll on the rules set's advancement table. Which
 *   advancement the roll then grants is not modelled.
 * - `granted_skill` — one fixed skill, named by the cost row, with no roll.
 *   A league house rule that hands out a set skill at an SPP threshold is
 *   recorded this way.
 *
 * Rules sets that price advancements by type rather than by fixed threshold
 * will add more specific kinds, and may then hold one cost per kind for the
 * same advancement number.
 */
export const ADVANCEMENT_KINDS = ['table_roll', 'granted_skill'] as const;

export type AdvancementKind = (typeof ADVANCEMENT_KINDS)[number];

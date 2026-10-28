/**
 * What an advancement's SPP cost buys.
 *
 * - `table_roll` — a roll on the rules set's advancement table. Which
 *   advancement the roll then grants is not modelled.
 *
 * Rules sets that price advancements by type rather than by fixed threshold
 * will add more specific kinds, and may then hold one cost per kind for the
 * same advancement number.
 */
export const ADVANCEMENT_KINDS = ['table_roll'] as const;

export type AdvancementKind = (typeof ADVANCEMENT_KINDS)[number];

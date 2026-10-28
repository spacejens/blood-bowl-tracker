/**
 * What an advancement's SPP cost buys.
 *
 * - `table_roll` — a roll on the rules set's advancement table, for rules
 *   sets with fixed SPP thresholds. Which advancement the roll then grants is
 *   not modelled.
 * - `random_primary_skill` — a skill rolled from one of the player's primary
 *   skill categories.
 * - `chosen_primary_skill` — a skill chosen from a primary skill category.
 * - `random_secondary_skill` — a skill rolled from a secondary skill category.
 * - `chosen_secondary_skill` — a skill chosen from a secondary skill category.
 * - `random_characteristic` — a roll for a characteristic increase.
 *
 * A fixed-threshold rules set holds only `table_roll` costs. A rules set that
 * prices advancements by type holds one cost per kind it offers for each
 * advancement number.
 */
export const ADVANCEMENT_KINDS = [
  'table_roll',
  'random_primary_skill',
  'chosen_primary_skill',
  'random_secondary_skill',
  'chosen_secondary_skill',
  'random_characteristic',
] as const;

export type AdvancementKind = (typeof ADVANCEMENT_KINDS)[number];

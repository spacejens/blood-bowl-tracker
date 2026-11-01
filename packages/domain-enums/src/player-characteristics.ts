/**
 * The five characteristics a player can raise with an advancement, by the
 * abbreviation every stat line uses, in stat-line order. Consumed as the
 * Postgres enum of `player_advancements.characteristic`, so the order is also
 * that enum's sort order.
 */
export const PLAYER_CHARACTERISTICS = ['MA', 'ST', 'AG', 'PA', 'AV'] as const;

export type PlayerCharacteristic = (typeof PLAYER_CHARACTERISTICS)[number];

/** How many times each characteristic was raised by advancement. */
export type PlayerCharacteristicCounts = Record<PlayerCharacteristic, number>;

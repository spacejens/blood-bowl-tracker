/** The most new advancements whose orders are searched: 6! = 720 assignments. */
export const MAX_DEDUCED = 6;

/**
 * The curated names of the skills a player only ever gains as free extras:
 * BB2025 grants Hatred on top of a player's advancements, never as one, and
 * a Loner can be gained without spending SPP; a journeyman's own Loner is a
 * starting skill (JourneymanLonerService keeps it), not a gained one. They
 * are outside the confirmed paid numbering; an unconfirmed one may hold a
 * proxy number. The name alone is each skill's identity:
 * their variants (Hatred's target, Loner's roll) live in `attribute_value`.
 */
export const FREE_EXTRA_SKILL_NAMES: readonly string[] = ['Hatred', 'Loner'];

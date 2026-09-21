/**
 * The kinds of BB2025 keyword a `keywords` row can be.
 *
 * - `species` — a creature/race keyword (Elf, Skaven, Undead, Ogre …). These
 *   are the ones TP publishes in the numeric `race` array on each
 *   position and star player.
 * - `positional` — a keyword describing a role rather than a creature
 *   (Lineman, Runner, Blitzer, Thrower, Catcher, Blocker, Special, Big Guy).
 *   The rulebook groups these with the species keywords, but they behave
 *   differently: Hatred can never target a positional keyword, while
 *   Animosity's target codes include "Big Guy". TP publishes these as the
 *   `positionTypes` bitmask and the `isBigGuy` flag rather than in the `race`
 *   array the species keywords come from.
 * - `special` — the single sentinel used for "no restriction", which
 *   Animosity's target code 999 ("All") carries. Neither a creature nor a
 *   role.
 */
export const KEYWORD_KINDS = ['species', 'positional', 'special'] as const;

export type KeywordKind = (typeof KEYWORD_KINDS)[number];

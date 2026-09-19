/**
 * The kinds of BB2025 keyword a `keywords` row can be.
 *
 * - `species` — a creature/race keyword (Elf, Skaven, Undead, Ogre …). These
 *   are the ones TP publishes directly, as the numeric `race` array on each
 *   position and star player.
 * - `positional` — a keyword describing a role rather than a creature
 *   (Special, Blitzer, Thrower, Big Guy). The rulebook groups these with the
 *   species keywords, but they behave differently: an effect that names a
 *   target keyword names a species one. Only "Big Guy" is curated today,
 *   because it is a confirmed Hatred target code; how TP models the rest is
 *   not known.
 * - `special` — the single sentinel used for "no restriction", which
 *   Animosity's target code 999 ("All") carries. Neither a creature nor a
 *   role.
 */
export const KEYWORD_KINDS = ['species', 'positional', 'special'] as const;

export type KeywordKind = (typeof KEYWORD_KINDS)[number];

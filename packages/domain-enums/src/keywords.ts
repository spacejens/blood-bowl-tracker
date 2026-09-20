/**
 * The kinds of BB2025 keyword a `keywords` row can be.
 *
 * - `species` — a creature/race keyword (Elf, Skaven, Undead, Ogre …). These
 *   are the ones TP publishes directly, as the numeric `race` array on each
 *   position and star player.
 * - `positional` — a keyword describing a role rather than a creature
 *   (Special, Blitzer, Thrower, Big Guy). The rulebook groups these with the
 *   species keywords, but they behave differently: a Hatred/Animosity target
 *   keyword is not necessarily a species one — "Big Guy" is a confirmed real
 *   target code despite being `positional`. Only "Big Guy" is curated today,
 *   because it is the confirmed one; how TP models the rest is not known.
 * - `special` — the single sentinel used for "no restriction", which
 *   Animosity's target code 999 ("All") carries. Neither a creature nor a
 *   role.
 */
export const KEYWORD_KINDS = ['species', 'positional', 'special'] as const;

export type KeywordKind = (typeof KEYWORD_KINDS)[number];

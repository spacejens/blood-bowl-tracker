/**
 * Which group a skill belongs to under one rules set — what an advancing
 * player rolls against to decide which skills they may take.
 *
 * - `general` — the common skills nearly every position can learn (Block,
 *   Sure Hands, Tackle, ...).
 * - `agility` — moving, dodging, jumping and catching (Dodge, Catch, Leap).
 * - `passing` — throwing the ball, and in some rules sets team-mates (Pass,
 *   Accurate, Safe Pair of Hands).
 * - `strength` — blocking, wrestling and raw physical force (Mighty Blow,
 *   Guard, Break Tackle).
 * - `mutation` — available only to positions whose rules allow mutations, on
 *   Chaos, Nurgle and similar teams (Claws, Horns, Tentacles).
 * - `devious` — BB2025's category for underhanded, cheating and dirty-trick
 *   skills. It is its own value rather than a re-use of `general` because
 *   BB2025 both created it and moved existing skills into it, which is
 *   precisely why a skill's category is recorded per rules set.
 * - `trait` — skills intrinsic to a position rather than learnable: the
 *   rulebooks' Extraordinary skills, traits and special rules (Regeneration,
 *   Loner, Really Stupid). Recorded so a position's starting skill set is
 *   complete, even though no advancement can ever grant one.
 * - `unique` — the category for a star player's one skill exclusive to them
 *   under a rules set. Used instead of a per-association flag on
 *   `position_rules_set_skills`: a star player's unique skill is identified
 *   purely by checking that its `skill_rules_sets` category is `unique` for
 *   the relevant rules set. Deliberately not enforced as globally unique
 *   across star players — if two star players are published sharing the same
 *   "unique" skill, that is not treated as a data error.
 *
 * The list is closed and small, so it is a `domain-enums` constant consumed
 * as a Postgres enum, exactly like CHARACTERISTIC_FORMATS. The skills
 * themselves are not: there are dozens of them, they are imported and
 * curated, and they therefore live in the `skills` table like positions and
 * races do.
 */
export const SKILL_CATEGORIES = [
  'general',
  'agility',
  'passing',
  'strength',
  'mutation',
  'devious',
  'trait',
  'unique',
] as const;

/**
 * How a player came by one of their skills.
 *
 * - `starting` — came from the player's position (or star player template),
 *   i.e. every player holding that position has it.
 * - `chosen` — gained via advancement, freely picked by the coach.
 * - `random` — gained via advancement, randomly rolled.
 *
 * Recorded as a provenance column on one unified `player_skills` table rather
 * than as separate starting/gained tables: insight toplists need "any skill a
 * player has", "only advancement-gained skills" and "only chosen advancement
 * skills", and a single table makes all three a plain `WHERE` instead of a
 * `UNION` across two query paths.
 *
 * The list is closed and small, so it is a `domain-enums` constant consumed
 * as a Postgres enum, exactly like SKILL_CATEGORIES above.
 */
export const PLAYER_SKILL_SOURCES = ['starting', 'chosen', 'random'] as const;

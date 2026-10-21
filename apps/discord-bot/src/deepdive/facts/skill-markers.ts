/**
 * Prefixed to a skill whose category is `unique` under the rules set being
 * shown: a star player's own exclusive skill. A skill is exclusive purely by
 * virtue of that category -- there is no separate flag, by deliberate schema
 * design.
 *
 * Shared by every deepdive line that lists skills (the position/star stat
 * line and the player deepdive's skill lines) so the same skill reads the
 * same wherever it appears. A plain Unicode symbol rather than an emoji,
 * matching every other marker in these embeds.
 */
export const UNIQUE_SKILL_MARKER = '★ ';

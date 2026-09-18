# Skills

A [skill](../../glossary.md#skill) is a named special ability a
[player](../players/index.md) can have — `Block`, `Dodge`, `Regeneration` and
so on. A [position](../positions/index.md) grants a set of skills to every
player who holds it, and players can gain more of them later through
advancements.

- A skill has a name, and nothing else. The name is the skill's identity
  across every [rules set](../rules-sets/index.md) that has it, so the same
  `Block` is one row whether a BB2020 or a BB2025 position starts with it.
- A skill belongs to a **skill category** — but per rules set, not globally.
  Categories are what an advancing player rolls against, and a rules set can
  move a skill between them: BB2025 introduced the Devious category and moved
  several existing skills into it. So the category is recorded on the skill ×
  rules-set association, for the same reason a position's characteristics are
  recorded on the position × rules-set association rather than on the
  position.
- A skill that a rules set has no association row for simply does not exist
  under that rules set. There is no "not applicable" marker.

## Skill categories

| Category | Meaning |
| --- | --- |
| General | The common skills nearly every position can learn. |
| Agility | Skills about moving, dodging, jumping and catching. |
| Passing | Skills about throwing the ball (and, in some rules sets, team-mates). |
| Strength | Skills about blocking, wrestling and raw physical force. |
| Mutation | Skills only available to positions whose rules allow mutations — Chaos, Nurgle and similar teams. |
| Devious | BB2025's category for underhanded, cheating and dirty-trick skills. |
| Trait | Skills that are intrinsic to a position rather than learnable — the rulebooks' Extraordinary skills, traits and special rules. Recorded so a position's starting skill set is complete. |
| Unique | The category for a star player's one skill exclusive to them under a rules set. |

## Starting skills

A position's starting skills are recorded per rules set, against the same
position × rules-set association that carries the position's characteristics.
That means a position's starting skills can only be recorded once its
characteristics under that rules set already are — a starting skill for a
position/rules-set pair that has no characteristics row is rejected.

A [star player](../star-players/index.md) is a position in this tracker, so
its starting skills are recorded the same way. A star player's skill exclusive
to them is identified purely by its Unique category under the relevant rules
set — there is no per-position marking on the starting-skill row, and no
enforced global uniqueness: any skill, Unique-category or not, can be a
starting skill of any number of positions.

Syncing starting skills, and syncing skills' rules-set categories, only adds
or updates rows for what's supplied. A starting skill or skill × rules-set
association that a later sync no longer includes is not automatically
removed — its row stays in place.

## Player skills

Every skill an individual [player](../players/index.md) has is recorded
against that player — the skills that came with their position included,
rather than only the ones they gained afterwards. They all live in one place
with a **source** marking how the player came by each:

| Source | Meaning |
| --- | --- |
| Starting | Came from the player's position (or [star player](../star-players/index.md) template). |
| Chosen | Gained through an advancement, freely picked. |
| Random | Gained through an advancement, randomly rolled. |

Starting skills are recorded per player rather than derived from the
position's list on demand, so that "every skill this player has", "only the
ones they earned" and "only the ones they picked" are each a single
straightforward question, instead of two different lookups stitched together.

A player skill can carry the same kind of variant a starting skill can —
Hatred's target race, Loner's roll number — and that variant is part of what
makes the skill distinct for that player: BB2025 lets a player take Hatred
more than once against different targets, while the same skill with no variant
can only be recorded once.

Gained skills also carry a best-effort **advancement order**. It is a
presentation-order proxy, not a confirmed sequence: neither source records the
real order in which a player's advancements were taken. Starting skills have
no order at all.

A gained skill is not checked against its category. Recording a Trait or
Unique skill as gained looks impossible under the base rules, but house rules
and competition-specific quirks can genuinely produce one, so what the source
published is stored as-is.

Syncing player skills only adds or updates rows for what's supplied. A player
skill that a later sync no longer includes is not automatically removed —
its row stays in place.

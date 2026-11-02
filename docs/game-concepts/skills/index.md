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
  rules-set association, for the same reason a position's [characteristics](../../glossary.md#characteristics) are
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

## Primary and secondary categories

Under each rules set, a position has the skill categories it may learn skills
from when it advances. Each is marked primary (its normal access) or
secondary (access that is harder or costlier to use, depending on the rules
set). Only the learnable categories can appear: General, Agility, Passing,
Strength, Mutation and Devious, never Trait or Unique. A category is never
both primary and secondary for one position.

Like starting skills, these are recorded only for a position that already
has characteristics under that rules set. Unlike starting skills, each sync
replaces a position's whole set: a category a later sync leaves out is
marked removed (never deleted) and no longer counts.

## Player skills

Every skill an individual [player](../players/index.md) has is recorded
against that player — the skills that came with their position included,
rather than only the ones they gained afterwards. They all live in one place
with a **source** marking how the player came by each:

| Source | Meaning |
| --- | --- |
| Starting | Came from the player's position (or [star player](../star-players/index.md) template). |
| Advancement | Gained through an advancement, but the source does not say whether it was chosen or rolled. |
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

Gained skills and characteristic increases share one **advancement order**:
a numbering of the player's paid advancements, which free extras and starting
skills do not take. An entry can have no order (unknown). An order is either a
presentation-order proxy, as with BBL's page order and TP's list order, or
**confirmed**, meaning it is trusted as the real sequence. A confirmed order
is set only where a source can establish it: a live TP import that sees one
new advancement, or works out the order of several from TP's reported spend.
An import never replaces a confirmed order with a guess. The cost model pins
only confirmed entries to their number. Starting skills have no order at all.

A gained skill is not checked against its category. Recording a Trait or
Unique skill as gained looks impossible under the base rules, but house rules
and competition-specific quirks can genuinely produce one, so what the source
published is stored as-is.

Some gained skills are **free extras**: the player has them without having
spent SPP, and they are not among the player's advancements, so they cost
nothing and do not raise the price of later advancements. Being a free extra
is recorded beside the skill's source, not instead of it: the source still
says chosen, random or advancement as the source system reported. Two kinds
are known:

- **Hatred** (BB2025) is only ever gained on top of a player's advancements,
  so every gained Hatred is a free extra. A player can hate several keywords,
  and each of those Hatred skills is free. TP also flags its extra skills
  itself, and every skill it flags is recorded as a free extra.
- **A skill a [trophy award](../trophies/index.md#trophy-award) grants**
  (Gudarnas Förkämpe's mutation). Neither BBL nor TP marks it as free; the
  award naming the skill is what marks it, whichever was recorded first.
  Changing or clearing the award's skill unmarks it again, unless another
  award of the same player still names it.

A Journeyman's Loner is also granted without SPP, but no source marks it, so
it is not recorded as a free extra.

Syncing player skills only adds or updates rows for what's supplied. A player
skill that a later sync no longer includes is not automatically removed —
its row stays in place.

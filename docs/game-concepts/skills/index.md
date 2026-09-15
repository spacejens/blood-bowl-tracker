# Skills

A [skill](../../glossary.md#skill) is a named special ability a
[player](../players/index.md) can have — `Block`, `Dodge`, `Regeneration` and
so on. A [position](../positions/index.md) grants a set of skills to every
player who holds it; players can also gain more of them later (not yet
modelled by the tracker).

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

## Starting skills

A position's starting skills are recorded per rules set, against the same
position × rules-set association that carries the position's characteristics.
That means a position's starting skills can only be recorded once its
characteristics under that rules set already are — a starting skill for a
position/rules-set pair that has no characteristics row is rejected.

A [star player](../star-players/index.md) is a position in this tracker, so
its starting skills are recorded the same way. Rules sets that give a star one
skill exclusive to them mark that on the individual starting-skill row rather
than on the skill itself, so an ordinary skill row can still be shared by
every position that starts with it.

Syncing starting skills, and syncing skills' rules-set categories, only adds
or updates rows for what's supplied. A starting skill or skill × rules-set
association that a later sync no longer includes is not automatically
removed — its row stays in place.

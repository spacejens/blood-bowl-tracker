# Players

A [player](../../glossary.md#player) is an individual on a [team era](../team-eras/index.md)'s roster.

- A player has a name.
- A player belongs to exactly one [team era](../team-eras/index.md), and therefore to exactly one [team](../teams/index.md) and exactly one [era](../eras/index.md).
- A player has exactly one [position](../positions/index.md), which must be valid
  for the team's [race](../races/index.md) — i.e. the position must have a current
  (non-deleted) relation to that race. (This is still aspirational: no validation
  code enforces it yet.)

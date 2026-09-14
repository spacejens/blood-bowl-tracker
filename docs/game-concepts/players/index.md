# Players

A [player](../../glossary.md#player) is an individual on a [team era](../team-eras/index.md)'s roster.

- A player has a name.
- A player belongs to exactly one [team era](../team-eras/index.md), and therefore to exactly one [team](../teams/index.md) and exactly one [era](../eras/index.md).
- A player has exactly one [position](../positions/index.md), which must be
  available for the team era's [race era](../races/index.md) — i.e. the
  position must have a relation to that race era. (This is still aspirational:
  no validation code enforces it yet.)
- A player has a set of **current lasting injuries**: whether they must miss
  their next game, how many niggling injuries they carry, and how many
  reductions each of their five [characteristics](../positions/index.md)
  currently sits under. This is live state, not history: newer
  [rules sets](../rules-sets/index.md) let these heal between
  [competitions](../competitions/index.md), so what a player has ever suffered
  (which the [match events](../match-events/index.md) record) and what is
  still outstanding are two different facts. BBL publishes this live state
  directly. TP publishes miss-next-game and niggling injuries directly, while
  the importer derives characteristic reductions from characteristic values.
- A reduction count is the _effective_ magnitude — how far the stored
  characteristic actually sits below the player's baseline — not a tally of
  every reduction ever suffered. A reduction the rules absorbed, because the
  characteristic was already at its floor or at the rules' cap on reductions,
  moved nothing and counts zero.
- Death is not tracked as a lasting injury. It is recorded as a match event
  and surfaced separately.

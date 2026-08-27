# Trophies

A [trophy](../../glossary.md#trophy) is a curated, named award a [team](../../glossary.md#team) or an individual [player](../../glossary.md#player) can win.

- A trophy has a name and an optional free-text description of its award criteria — the description is optional because a trophy may be known by name well before its criteria are documented.
- A trophy is scoped to exactly one of a [competition group](../competitions/index.md#competition-groups) or a [league](../leagues/index.md), never both and never neither. A group-scoped trophy (e.g. "Major Gold") is awarded through every competition in that recurring group; a league-scoped trophy is a lifetime-achievement style award that any competition in the league can grant.
- A trophy's recipient kind — team or individual player — is fixed at creation and does not vary from one award to the next.
- Trophies are curated by hand rather than inferred from source data, for the same reason [competition groups](../competitions/index.md#competition-groups) are: a source system's label text alone (e.g. `1st`) cannot disambiguate which trophy is meant. See [docs/import-manual](../../import-manual/index.md#trophies) for how the curated catalog is maintained.

## Trophy award

A [trophy award](../../glossary.md#trophy-award) is one concrete instance of a trophy being given out, in one [competition](../competitions/index.md), to one recipient.

- It always records a [team era](../team-eras/index.md), even when the award goes to a player: a player never changes teams, so the team era is unambiguous, and recording it directly keeps "awards by team" queries consistent without a hop through the player.
- It additionally records a [player](../players/index.md), but only when its trophy is a player trophy.
- Its recipient kind must match its trophy's, and the competition it was awarded in must fall inside the trophy's curated scope — a Major-Season trophy cannot be awarded for a Minor-Season competition.
- The same trophy, competition, team era, and player combination can only be awarded once.

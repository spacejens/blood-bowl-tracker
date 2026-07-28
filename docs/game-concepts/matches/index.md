# Matches

A [match](../../glossary.md#match) is a single game of Blood Bowl played within a [competition](../competitions/index.md).

- A match belongs to exactly one [competition](../competitions/index.md).
- A match involves two or more [team eras](../team-eras/index.md). Almost all matches have exactly two; more than two is a rare variant.
- A match contains zero or more [match events](../match-events/index.md).
- A match has a mandatory display name (e.g. "Final", "Vecka 40-41"). Names are not unique and must never be used as an external ID.
- A match has a mandatory category describing its stage within the competition: `normal` (the default for routine league and cup play), `cup_final`, `season_semi_final`, `season_final`, `season_bronze`, or `season_qualifier`. There is no "unknown" value — an importer that cannot classify a match must fail rather than guess. A category must be consistent with its competition's type (`cup_final` only on a cup, `season_*` only on a season); this is enforced in application code, not in the database.
- Each participating team era has a mandatory score: its final touchdown count for the match. It is stored on the match team (a deliberate denormalization of the match's `touchdown` events) and computed once at import time.
- A match has an outcome: either a specific winning match team, or a draw. It is stored as a nullable reference to the winning match team, where no reference always and only means a draw — every match's outcome is fully resolved at import time, so there is no "unknown" state. An importer that cannot determine an outcome fails rather than guessing.

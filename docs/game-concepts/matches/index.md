# Matches

A [match](../../glossary.md#match) is a single game of Blood Bowl played within a [competition](../competitions/index.md).

- A match belongs to exactly one [competition](../competitions/index.md).
- A match involves two or more [team eras](../team-eras/index.md). Almost all matches have exactly two; more than two is a rare variant.
- A match contains zero or more [match events](../match-events/index.md).
- A match has a mandatory display name (e.g. "Final", "Vecka 40-41"). Names are not unique and must never be used as an external ID.
- A match has a mandatory [match category](../../glossary.md#match-category) describing its stage within the competition; `normal` is the default for routine league and cup play, and the other categories mark the special stages of a cup or a season. The exact values are `MATCH_CATEGORIES` in `packages/domain-enums/src/matches.ts`. There is no "unknown" value — an importer that cannot classify a match must fail rather than guess. A category must be consistent with its competition's type (a cup-stage category only on a cup, a season-stage category only on a season); this is enforced in application code, not in the database.
- Each participating team era has a mandatory score: its final touchdown count for the match. It is stored on the match team (a deliberate denormalization of the match's `touchdown` events) and computed once at import time.
- A match has an outcome: either a specific winning match team, or a draw. It is stored as a nullable reference to the winning match team, where no reference always and only means a draw — every match's outcome is fully resolved at import time, so there is no "unknown" state. An importer that cannot determine an outcome fails rather than guessing.

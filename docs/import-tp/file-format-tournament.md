# `tournament_<slug>.json` (base file — parsed)

See [file-format.md](./file-format.md) for the other pages.

Fully handled in code: `packages/parse-tp`'s `parseTournament()` extracts
only `{ id: number, name: string, ruleSet: number }`. The body carries much
more — `nameNormalized` (the slug used for the competition subdirectory
name), `country`/`locality`/`region`/`address`/`postalCode`, `creationDate`,
`state`, `isNaf`, `isSpecialist`, and a `categories[]` array whose nested
`phases[]` entries carry the tournament's full Blood Bowl ruleset
configuration (`pointsWin`/`pointsDraw`/`pointsDefeat`, `mvpCandidates`,
`weatherAvailables`, `spirallingExpenses`, `expensiveMistakes`, and dozens
more) — none of this is parsed yet; competition import consumes only the
`{ id, name, ruleSet }` already extracted, so it remains out of scope until a
future sub-issue needs it.

# `tournament_<slug>.json` (base file — parsed)

See [file-format.md](./file-format.md) for the other pages.

Fully handled in code: `packages/parse-tp`'s `TournamentParserService.parse()`
extracts only `{ id, name, ruleSet }`, each category's phases (`{ id, order }`)
and each category's `id` (as `categoryIds`). The body carries much more —
`nameNormalized` (the slug used for the competition subdirectory name),
`country`/`locality`/`region`/`address`/`postalCode`, `creationDate`, `state`,
`isNaf`, `isSpecialist`, and a `categories[]` array whose nested entries carry
the tournament's full Blood Bowl ruleset configuration (`pointsWin`/`pointsDraw`/
`pointsDefeat`, `mvpCandidates`, `weatherAvailables`, `spirallingExpenses`,
`expensiveMistakes`, and dozens more) — none of this is parsed yet;
competition import consumes only what is already extracted, so the rest stays
unparsed until something needs it.
